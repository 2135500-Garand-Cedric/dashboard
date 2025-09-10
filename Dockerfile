# Use official Node.js image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema before running generate
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the project
COPY . .

# Expose Next.js port
EXPOSE 3000

# Start dev server
CMD ["npm", "run", "dev"]
