#!/bin/bash
# Kill all DOK1GraderV3 dev server processes

echo "Killing DOK1GraderV3 dev server processes..."

# Kill npm run dev processes for this project
pkill -f "npm run dev.*DOK1GraderV3" 2>/dev/null
pkill -f "tsx.*DOK1GraderV3/server" 2>/dev/null
pkill -f "node.*DOK1GraderV3/node_modules" 2>/dev/null

# Kill any process running on common dev ports (5000, 3000, 5173)
fuser -k 5000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null

echo "Done. Killed processes:"
ps aux | grep -E "DOK1GraderV3.*(npm|tsx|node)" | grep -v grep || echo "No remaining processes found."
