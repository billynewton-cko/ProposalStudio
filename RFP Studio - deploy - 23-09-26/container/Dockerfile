# RFP Studio — single-file editor served by the Express backend.
#
# Differs from the hackathon build in one way: there is no Next.js build stage.
# The frontend is public/index.html (the single-file editor), copied straight in.
FROM 891377407345.dkr.ecr.eu-west-1.amazonaws.com/cko-pull-through/docker-hub/library/node:20-alpine
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/server.js ./
COPY server/src ./src

# The editor IS the frontend. Served by express.static at /
COPY public ./public

# Seed data (the org user directory) is bundled; entrypoint copies it to /data
# on first boot, because an EFS mount starts empty.
COPY server/data /seed-data
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV DATA_DIR=/data

ENTRYPOINT ["/entrypoint.sh"]
