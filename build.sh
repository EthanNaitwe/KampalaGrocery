#!/bin/bash

# Build the client
cd client
npm install
npm run build
cd ..

echo "Build completed!"