FROM node:20-slim

# Install Python for XGBoost
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && \
    pip3 install --no-cache-dir xgboost scikit-learn numpy --break-system-packages || true

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY ensemble.js ./
COPY gbm_train.py ./
COPY gbm_predict.py ./

RUN mkdir -p /app/models/nn /app/models/gbm /app/data

EXPOSE 5001

CMD ["node", "server.js"]
