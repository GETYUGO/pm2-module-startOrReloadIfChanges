# Description
Module for PM2 that give you command for reload only services that have changed.
# Installation
Clone and access repo:
```bash
git clone git@github.com:GETYUGO/pm2-module-startOrReloadIfChanges.git
cd pm2-module-startOrReloadIfChanges
pm2 install .
```
# Usage
### Call reload action:
```bash
pm2 trigger startOrReloadIfChanges reloads [directory_base_path]
```
### Refresh checksums:
```bash
pm2 trigger startOrReloadIfChanges refresh [directory_base_path]
```
# Configuration
Some configuration variables are configurable using command:
```bash
pm2 set startOrReloadIfChanges:option_name <new_value>
```
## services_md5_file
Name of file use for store checksums. 
(default: `services_md5.json`)

This file is store to `$HOME/.pm2/`
## ecosystem_file
Name of the ecosystem file to search. 
(default: `ecosystem.config.json`)

This file must be store in directory gave on command launch.
## to_restart_file
Name of ecosystem file created by module when finish running.
It contains only services to start or restart. 
(default: `ecosystem.restart.json`)

This file will be store in directory gave on command launch.
## to_stop_file
Name of ecosystem file created by module when finish running.
It contains only services to stop.
(default: `ecosystem.stop.json`)

This file will be store in directory gave on command launch.
