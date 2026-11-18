#!/bin/bash
set -e
sudo chown -R ubuntu:www-data /var/www/shoopp/shopper/dist
sudo chmod -R 755 /var/www/shoopp/shopper/dist
sudo systemctl reload nginx
echo "Frontend permissions and Nginx reloaded successfully"

