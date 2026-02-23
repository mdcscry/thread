#!/bin/bash
# THREAD CI/CD Local Script
# Run this to simulate the CI/CD pipeline locally

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== THREAD CI/CD Pipeline ===${NC}"

# Parse arguments
ACTION=${1:-test}

case $ACTION in
  test)
    echo -e "${YELLOW}Running tests...${NC}"
    cd ~/Documents/outerfit
    npx playwright test --reporter=line
    echo -e "${GREEN}Tests passed!${NC}"
    ;;

  deploy-qa)
    echo -e "${YELLOW}Deploying to QA (qa branch)...${NC}"
    cd ~/Documents/outerfit
    
    # Check we're on qa
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" != "qa" ]; then
      echo -e "${RED}Error: Must be on qa branch to deploy to QA${NC}"
      exit 1
    fi
    
    # Build client
    cd client && npm run build && cd ..
    
    # Restart test server
    pm2 restart thread-test
    echo -e "${GREEN}QA deployed!${NC}"
    echo "Test server: https://localhost:3002"
    ;;

  promote)
    echo -e "${YELLOW}Promoting qa to main...${NC}"
    cd ~/Documents/outerfit
    
    # Check we're on qa
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" != "qa" ]; then
      echo -e "${RED}Error: Must be on qa branch to promote${NC}"
      exit 1
    fi
    
    # Merge to main
    git checkout main
    git merge qa --no-ff -m "chore: promote qa to production"
    git push origin main
    
    # Build and deploy production
    cd client && npm run build && cd ..
    pm2 restart thread
    
    echo -e "${GREEN}Promoted to production!${NC}"
    echo "Production: https://localhost:3000"
    ;;

  restart)
    echo -e "${YELLOW}Restarting services...${NC}"
    pm2 restart thread
    pm2 restart thread-test
    echo -e "${GREEN}Services restarted!${NC}"
    ;;

  status)
    echo -e "${YELLOW}Service Status:${NC}"
    pm2 status
    ;;

  logs)
    SERVICE=${2:-thread}
    echo -e "${YELLOW}Logs for $SERVICE:${NC}"
    pm2 logs $SERVICE --lines 30
    ;;

  *)
    echo "Usage: $0 {test|deploy-qa|promote|restart|status|logs}"
    echo ""
    echo "Commands:"
    echo "  test        - Run Playwright tests"
    echo "  deploy-qa   - Build and restart QA server (must be on qa branch)"
    echo "  promote     - Merge qa to main and deploy production"
    echo "  restart     - Restart both production and QA servers"
    echo "  status      - Show PM2 status"
    echo "  logs        - Show server logs (specify thread or thread-test)"
    exit 1
    ;;
esac
