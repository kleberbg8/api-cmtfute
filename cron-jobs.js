// cron-jobs.js
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { buscarJogos } from './scraper.js';
import { setCache } from './cache.js';

const cacheDir = path.join(process.cwd(), 'cache');

/**
 * Retorna a data formatada como YYYY-MM-DD.
 * @param {Date} date - O objeto de data.
 * @returns {string} - A data formatada.
 */
function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// TAREFA 1: Atualizar o cache dos jogos estáticos (diariamente)
async function updateDailyCache() {
    console.log('CRON DIÁRIO: Iniciando atualização do cache por data...');
    
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);

    const diasParaBuscar = [
        { nome: 'hoje', data: getFormattedDate(hoje) },
        { nome: 'amanha', data: getFormattedDate(amanha) }
    ];

    for (const diaInfo of diasParaBuscar) {
        try {
            console.log(`Buscando jogos para '${diaInfo.nome}'...`);
            const dados = await buscarJogos(diaInfo.nome);
            setCache(diaInfo.data, dados);
        } catch (error) {
            console.error(`CRON DIÁRIO: Falha ao atualizar cache para '${diaInfo.nome}' (data ${diaInfo.data}):`, error);
        }
    }
    console.log('CRON DIÁRIO: Atualização por data finalizada.');
}

// TAREFA 2: Atualizar o cache dos jogos ao vivo
async function updateLiveCache() {
    console.log('CRON AO VIVO: Iniciando atualização do cache para "agora"...');
    try {
        const dados = await buscarJogos('agora');
        setCache('agora', dados);
    } catch (error) {
        console.error('CRON AO VIVO: Falha ao atualizar cache para "agora":', error);
    }
    console.log('CRON AO VIVO: Atualização finalizada.');
}

// ===================================================================
// NOVA TAREFA 3: Limpar arquivos de cache antigos
// ===================================================================
async function purgeOldCache() {
    console.log('CRON LIMPEZA: Iniciando limpeza de cache antigo...');
    
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);
    
    // Lista de arquivos que DEVEM ser mantidos
    const filesToKeep = new Set([
        'agora.json', // Cache ao vivo
        `${getFormattedDate(hoje)}.json`, // Cache de hoje
        `${getFormattedDate(ontem)}.json`, // Cache de ontem (ainda pode ser útil)
        `${getFormattedDate(amanha)}.json` // Cache de amanhã
    ]);

    try {
        const files = fs.readdirSync(cacheDir);
        let count = 0;
        for (const file of files) {
            if (!filesToKeep.has(file)) {
                // Apaga o arquivo se ele não estiver na lista para manter
                fs.unlinkSync(path.join(cacheDir, file));
                console.log(`CRON LIMPEZA: Arquivo de cache antigo removido: ${file}`);
                count++;
            }
        }
        console.log(`CRON LIMPEZA: Limpeza finalizada. ${count} arquivos removidos.`);
    } catch (error) {
        console.error('CRON LIMPEZA: Falha ao limpar o cache antigo:', error);
    }
}

// Função principal que inicia tudo
export function startScheduledJobs() {
    // Agenda a tarefa diária para 00:01
    cron.schedule('1 0 * * *', updateDailyCache, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    // Agenda a tarefa de jogos ao vivo para rodar a cada 1 minuto.
    cron.schedule('* * * * *', updateLiveCache, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });
    
    // Agenda a tarefa de limpeza para rodar todo dia às 00:05
    cron.schedule('5 0 * * *', purgeOldCache, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    console.log('Tarefas agendadas: Diária (00:01), Ao Vivo (a cada 1 min) e Limpeza (00:05).');

    // Executa as tarefas uma vez na inicialização para criar o primeiro cache
    console.log('Executando aquecimento de cache inicial...');
    updateDailyCache();
    updateLiveCache();
    // Executa a limpeza também na inicialização
    purgeOldCache();
}
