# A hosted replay of a recorded run: the site and both consoles, no keys, no sandbox calls.
# Node only, nothing to install.
FROM node:20-slim
ENV NODE_ENV=production OUTBID_STAGE_HOST=0.0.0.0 OUTBID_STAGE_PORT=4780
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY web ./web
COPY evidence ./evidence
EXPOSE 4780
CMD ["node", "src/replay-cli.mjs", "evidence/2026-11-02.json", "--now"]
