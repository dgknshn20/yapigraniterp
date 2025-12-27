FROM node:20-alpine

WORKDIR /app

# Environment variables
ENV NODE_ENV=development
ENV REACT_APP_API_URL=http://localhost:8000/api

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "start"]
