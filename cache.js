// cache.js
import fs from 'fs';
import path from 'path';

const cacheDir = path.join(process.cwd(), 'cache');

// Garante que a pasta 'cache' exista
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}

export function setCache(key, data) {
    const filePath = path.join(cacheDir, `${key}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Cache salvo com sucesso para a chave: ${key}`);
    } catch (error) {
        console.error(`Erro ao salvar o cache para a chave: ${key}`, error);
    }
}

export function getCache(key) {
    const filePath = path.join(cacheDir, `${key}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        return null; // Cache não existe
    } catch (error) {
        console.error(`Erro ao ler o cache para a chave: ${key}`, error);
        return null;
    }
}