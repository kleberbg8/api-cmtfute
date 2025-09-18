import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const baseUrl = 'https://www.futebolnatv.com.br';
const localDomain = 'https://img.futebol.cenariomt.com.br/public';

// Função genérica para baixar e salvar imagens
async function baixarImagem(url, pasta) {
  if (!url) return null;
  try {
    const nomeArquivo = path.basename(url);
    const destino = path.join('public', pasta, nomeArquivo);

    fs.mkdirSync(path.dirname(destino), { recursive: true });

    // só baixa se não existir ainda
    if (!fs.existsSync(destino)) {
      const resp = await axios.get(url.startsWith('http') ? url : baseUrl + url, { responseType: 'arraybuffer' });
      fs.writeFileSync(destino, resp.data);
      console.log(`Imagem salva: ${destino}`);
    }

    return `${localDomain}/${pasta}/${nomeArquivo}`;
  } catch (err) {
    console.error(`Erro ao baixar imagem ${url}:`, err.message);
    return url; // fallback para URL original
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
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
    });
    const page = await browser.newPage();
    console.log(`Navegando para ${urlDoSite}...`);

    await page.goto(urlDoSite, { waitUntil: 'networkidle2', timeout: 120000 });
    
    // scroll até o fim
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

      const campeonatoNome = card.find('div.all-scores-widget-competition-header-container-hora div.col-sm-8').text().trim();
      const iconeCampeonatoSrc = card.find('div.all-scores-widget-competition-header-container-hora img').attr('src');
      
      const timeCasaElement = card.find('div.d-flex.justify-content-between').first();
      const timeForaElement = card.find('div.d-flex.justify-content-between').last();

      const timeCasa = timeCasaElement.find('span').first().clone().children().remove().end().text().trim();
      const timeFora = timeForaElement.find('span').first().clone().children().remove().end().text().trim();

      const iconeCasaSrc = timeCasaElement.find('img').attr('src');
      const iconeForaSrc = timeForaElement.find('img').attr('src');

      let horario, status, placarCasa, placarFora;
      const liveTimeText = card.find('div.cardtime.badge.live').text().trim();
      
      if (liveTimeText && (liveTimeText.includes("'") || liveTimeText.toLowerCase().includes('intervalo'))) {
        horario = card.find('div.box_time').text().trim();
        status = liveTimeText;
        placarCasa = timeCasaElement.find('span').last().text().trim();
        placarFora = timeForaElement.find('span').last().text().trim();
      } else {
        horario = card.find('div.box_time').text().trim();
        status = "Agendado";
        placarCasa = "";
        placarFora = "";
      }

      const canais = [];
      card.find('div.bcmact').each((i, el) => {
        const nomeCanal = $(el).find('img').attr('alt');
        const iconeCanalSrc = $(el).find('img').attr('src');
        if (nomeCanal && iconeCanalSrc) {
          canais.push({ canal: nomeCanal, icone: iconeCanalSrc });
        }
      });

      if (timeCasa && timeFora) {
        jogosEncontrados.push({
          campeonato: { nome: campeonatoNome, icone: iconeCampeonatoSrc },
          horario,
          status,
          partida: { timeCasa, iconeCasa: iconeCasaSrc, placarCasa, timeFora, iconeFora: iconeForaSrc, placarFora },
          canais
        });
      }
    });

    // Baixar e substituir imagens
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
