#!/bin/sh
# Bring the database schema up to date, then start the server. A failed migration stops the container
# instead of serving an app that does not match its database.
set -e
node scripts/migrate.mjs
exec node server.js
