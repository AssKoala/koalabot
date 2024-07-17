FROM node:22

# Install python pre-reqs
RUN apt-get update && apt-get install -y python3 python-is-python3 python3-praw

# Copy bot to runtime directory
COPY bot /bottymcbotface/bot

# Copy package.json
COPY package.json /bottymcbotface/bot
