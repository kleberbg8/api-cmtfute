# Use uma imagem oficial do Node.js como base
FROM node:20-slim

# Instala todas as dependências de sistema que o Puppeteer precisa
# O comando '--no-install-recommends' evita instalar pacotes desnecessários
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxrandr2 \
      libxshmfence1 \
      lsb-release \
      wget \
      xdg-utils \
      # Limpa o cache para manter a imagem pequena
      && rm -rf /var/lib/apt/lists/*

# Cria um diretório para a aplicação dentro do contêiner
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências do Node.js
RUN npm install

# Copia o restante dos arquivos da aplicação
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Define o comando para iniciar a aplicação
CMD ["npm", "start"]