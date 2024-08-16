FROM node:22

RUN apt-get update && apt-get install -y python3 python-is-python3 python3-praw

WORKDIR /bot

COPY src .
COPY package.json .

RUN npm install && npm install typescript -g
COPY . .

RUN tsc

CMD ["node", "./build/main.js"]
