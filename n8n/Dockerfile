FROM n8nio/n8n:latest

USER root
RUN cd /usr/local/lib/node_modules/n8n && npm install sharp
USER node

ENV NODE_FUNCTION_ALLOW_EXTERNAL=sharp
