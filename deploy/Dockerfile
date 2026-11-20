FROM public.ecr.aws/docker/library/caddy:2.11-alpine AS media-tools
WORKDIR /media
COPY deploy/ffmpeg-linux-amd64.tar.xz deploy/ffmpeg.sha256 ./
RUN sha256sum -c ffmpeg.sha256 \
    && mkdir /out \
    && tar -xJf ffmpeg-linux-amd64.tar.xz --strip-components=2 -C /out \
       ffmpeg-n8.1.3-35-gf1acb0a266-linux64-gpl-8.1/bin/ffmpeg \
       ffmpeg-n8.1.3-35-gf1acb0a266-linux64-gpl-8.1/bin/ffprobe

FROM public.ecr.aws/docker/library/node:24-bookworm-slim
WORKDIR /app
COPY --from=media-tools /out/ /usr/local/bin/
RUN ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null \
    && npm install --global pnpm@11.28.5 --no-audit --no-fund

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --filter @petcloud/server --prod --frozen-lockfile

COPY server/noseprint/requirements.txt server/noseprint/
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends ca-certificates python3-venv libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/petcloud-noseprint \
    && /opt/petcloud-noseprint/bin/pip install --no-cache-dir --only-binary=:all: -r server/noseprint/requirements.txt
ENV PET_NOSEPRINT_PYTHON=/opt/petcloud-noseprint/bin/python

COPY server/dist/ server/dist/
COPY server/migrations/ server/migrations/
COPY server/noseprint/scan.py server/noseprint/
COPY shared/*.mjs shared/
USER node
CMD ["sh", "-ec", "node server/dist/migrate.js && exec node server/dist/index.js"]
