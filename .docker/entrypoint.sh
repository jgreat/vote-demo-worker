#!/bin/bash
echo "---- Starting Up Service ---- "


if [ "$RANCHER_SERVICE_DISCOVERY" ]; then
  sleep 1

  function get_service {
    curl -sS --header "accept: application/json" http://rancher-metadata.rancher.internal/latest/$1
  }

  env=$( get_service "self/stack" )
  rabbit=$( get_service "services/rabbit" )
  mssql=$( get_service "services/mssql" )

  IFS='-' read -ra NAMES <<< $( echo $env | jq -r '.environment_name' )
  env_vnet=$( echo ${NAMES[0]} )
  env_instance=$( echo ${NAMES[1]} )
  env_name=$( echo $env | jq -r '.name')

  # setup all of the environment variable
  if [ -z "$LK_ENVIRONMENT" ]; then
    export LK_ENVIRONMENT=$( echo $env_instance )
  fi

  if [ -z "$RABBITMQ_HOST" ]; then
    export RABBITMQ_HOST=rabbit.rabbit.rancher.internal
  fi
  if [ -z "$RABBITMQ_PORT" ]; then
    export RABBITMQ_PORT=$( echo $rabbit | jq -r '.labels["io.leankit.service.port.amqp"]' | sed -e 's/\/\(tcp\|udp\)//' )
  fi
  if [ -z "$RABBITMQ_USERNAME" ]; then
    export RABBITMQ_USERNAME=$( echo $rabbit | jq -r '.labels["io.leankit.service.username"]' )
  fi
  if [ -z "$RABBITMQ_PASSWORD" ]; then
    export RABBITMQ_PASSWORD=$( echo $rabbit | jq -r '.labels["io.leankit.service.password"]' )
  fi
  if [ -z "$RABBITMQ_VHOST" ]; then
    export RABBITMQ_VHOST=$( echo $rabbit | jq -r '.labels["io.leankit.service.vhost"]' )
  fi

  if [ -z "$SQL_HOST" ]; then
    export SQL_HOST=$( echo $mssql | jq -r '.labels["io.leankit.service.hostname"]' )
  fi
  if [ -z "$SQL_USERNAME" ]; then
    export SQL_USERNAME=$( echo $mssql | jq -r '.labels["io.leankit.service.username"]' )
  fi
  if [ -z "$SQL_PASSWORD" ]; then
    export SQL_PASSWORD=$( echo $mssql | jq -r '.labels["io.leankit.service.password"]' )
  fi
  if [ -z "$SQL_DATABASE" ]; then
    export SQL_DATABASE=$( echo $mssql | jq -r '.labels["io.leankit.service.database"]' )
  fi

fi

# print out all of the environment variables
echo "#### entry.sh - Start Dump Variables ####"
env
echo "#### entry.sh - End Dump Variables ####"

# Execute the commands passed to this script
exec "$@"