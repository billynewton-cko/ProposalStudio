#!/bin/sh
set -e

# Seed /data from the bundled seed data on first boot (EFS mount starts empty)
if [ -z "$(ls -A /data 2>/dev/null)" ]; then
  echo "[init] /data is empty — seeding from bundled data..."
  cp -r /seed-data/. /data/
  echo "[init] Seeding complete."
fi

exec node server.js
