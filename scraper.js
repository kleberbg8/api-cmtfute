import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const baseUrl = 'https://www.futebolnatv.com.br';
const localDomain = 'https://img.futebol.cenariomt.com.br/public';

// -------- utils --------
function abs(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : baseUrl + url;
}

// Função genérica para baixar e salvar imagens (mantida)
async function baixarImagem(url, pasta) {
  if (!url) return null;
  try {
    const nomeArquivo = path.basename(url);
    const destino = path.join('public', pasta, nomeArquivo);

    fs.mkdirSync(path.dirname(destino), { recursive: true });

    if (!fs.existsSync(destino)) {
      const resp = await axios.get(abs(url), { responseType: 'arraybuffer' });
      fs.writeFileSync(destino, resp.data);
      console.log(`Imagem salva: ${destino}`);
    }

    return `${localDomain}/${pasta}/${nomeArquivo}`;
  } catch (err) {
    console.error(`Erro ao baixar imagem ${url}:`, err.message);
    return abs(url); // fallback para URL absoluta original
  }
}

// Abre a página do jogo e extrai os dois brasões
async function extrairBrasoesDaPaginaJogo(browser, detalheUrl) {
  const page = await browser.newPage();
  try {
    await page.goto(detalheUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise(r => setTimeout(r, 1500)); // ajuda em lazy-load

    const html = await page.content();
    const $d = cheerio.load(html);

    // 1) Estrutura mais comum no site atual (vide prints)
    let imgs = $d('div.box_time img[alt], div.box_time img[title]')
      .map((_, el) => $d(el).attr('data-src') || $d(el).attr('src'))
      .get();

    // 2) Fallbacks frequentes
    if (imgs.length < 2) {
      imgs = $d('.all-scores-widget-team-container img, .team img, .team-logo img, img.team-logo')
        .map((_, el) => $d(el).attr('data-src') || $d(el).attr('src'))
        .get();
    }

    imgs = imgs.filter(Boolean).map(abs);
    return {
      iconeCasa: imgs[0] || null,
      iconeFora: imgs[1] || null
    };
  } catch (e) {
    console.error('Falha extraindo brasões em', detalheUrl, e);
    return { iconeCasa: null, iconeFora: null };
  } finally {
    await page.close();
  }
}

export async function buscarJogos(dia = 'hoje') {
  const urls = {
    agora: `${baseUrl}/jogos-aovivo/`,
    hoje: `${baseUrl}/jogos-hoje/`,
    amanha: `${baseUrl}/jogos-amanha/`,
  };
  const urlDoSite = urls[dia] || urls['hoje'];
  console.log(`Iniciando scraper para a seção: '${dia}'...`);

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
    });
    const page = await browser.newPage();
    console.log(`Navegando para ${urlDoSite}...`);

    await page.goto(urlDoSite, { waitUntil: 'networkidle2', timeout: 120000 });

    // scroll até o fim (carregar todos os cards)
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 250);
      });
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('Rolagem finalizada. Extraindo HTML...');

    const html = await page.content();
    const $ = cheerio.load(html);
    const jogosEncontrados = [];

    $('div.gamecard').each((index, element) => {
      const card = $(element);

      // campeonato
      const campeonatoNome = card.find('div.all-scores-widget-competition-header-container-hora div.col-sm-8').text().trim();
      const iconeCampeonatoSrc = card.find('div.all-scores-widget-competition-header-container-hora img').attr('src');

      // times/placar/horário
      const timeCasaElement = card.find('div.d-flex.justify-content-between').first();
      const timeForaElement = card.find('div.d-flex.justify-content-between').last();

      const timeCasa = timeCasaElement.find('span').first().clone().children().remove().end().text().trim();
      const timeFora = timeForaElement.find('span').first().clone().children().remove().end().text().trim();

      let horario, status, placarCasa, placarFora;
      const liveTimeText = card.find('div.cardtime.badge.live').text().trim();

      if (liveTimeText && (liveTimeText.includes("'") || liveTimeText.toLowerCase().includes('intervalo'))) {
        horario = card.find('div.box_time').text().trim();
        status = liveTimeText;
        placarCasa = timeCasaElement.find('span').last().text().trim();
        placarFora = timeForaElement.find('span').last().text().trim();
      } else {
        horario = card.find('div.box_time').text().trim();
        status = 'Agendado';
        placarCasa = '';
        placarFora = '';
      }

      // coletar canais (sem await aqui)
      const canais = [];
      card.find('div.bcmact').each((i, el) => {
        const nomeCanal = $(el).find('img').attr('alt');
        const iconeCanalSrc = $(el).find('img').attr('src');
        if (nomeCanal && iconeCanalSrc) {
          canais.push({ canal: nomeCanal, icone: abs(iconeCanalSrc) });
        }
      });

      // NOVO: url de detalhes do jogo (para buscar brasões)
      const detalheHref =
        card.find('a[href*="/jogo/"], a[href*="/partida/"], a[href]').attr('href') || '';
      const detalheUrl = abs(detalheHref);

      if (timeCasa && timeFora) {
        jogosEncontrados.push({
          campeonato: { nome: campeonatoNome, icone: abs(iconeCampeonatoSrc) },
          horario,
          status,
          partida: {
            timeCasa,
            iconeCasa: null,
            placarCasa,
            timeFora,
            iconeFora: null,
            placarFora
          },
          detalheUrl,
          canais
        });
      }
    });

    // Busca brasões abrindo a página do jogo (com limite de concorrência)
    const CONC = 4;
    let idx = 0;
    while (idx < jogosEncontrados.length) {
      const slice = jogosEncontrados.slice(idx, idx + CONC);
      await Promise.all(slice.map(async (j) => {
        if (j.detalheUrl) {
          const { iconeCasa, iconeFora } = await extrairBrasoesDaPaginaJogo(browser, j.detalheUrl);
          j.partida.iconeCasa = iconeCasa;
          j.partida.iconeFora = iconeFora;
        }
        delete j.detalheUrl; // não expõe na resposta final
      }));
      idx += CONC;
    }

    // Baixar e substituir imagens (mantido)
    for (const jogo of jogosEncontrados) {
      if (jogo.campeonato.icone) jogo.campeonato.icone = await baixarImagem(jogo.campeonato.icone, 'countries');
      if (jogo.partida.iconeCasa) jogo.partida.iconeCasa = await baixarImagem(jogo.partida.iconeCasa, 'teams');
      if (jogo.partida.iconeFora) jogo.partida.iconeFora = await baixarImagem(jogo.partida.iconeFora, 'teams');

      for (const canal of jogo.canais) {
        if (canal.icone) canal.icone = await baixarImagem(canal.icone, 'channels');
      }
    }

    console.log(`Extração finalizada! ${jogosEncontrados.length} jogos encontrados para '${dia}'.`);
    return jogosEncontrados;

  } catch (error) {
    console.error(`Ocorreu um erro no scraper para a seção '${dia}':`, error);
    throw new Error(`Falha ao buscar os jogos da seção: ${dia}.`);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Navegador fechado.');
    }
  }
}
