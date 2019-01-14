var amqp = require('amqplib');
var { Pool, Client } = require('pg');
var util = require('util');

var debug = process.env.DEBUG;
var config = {
  pg: {
    host: process.env.POSTGRES_HOST || 'postgresql',
    user: process.env.POSTGRES_USER || 'vote',
    password: process.env.POSTGRES_PASSWORD || 'vote',
    database: process.env.POSTGRES_DB || 'vote',
    port: process.env.POSTGRES_DB_PORT || 5432
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'rabbitmq',
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    port: process.env.RABBITMQ_AMQP_PORT || 5672,
    vhost: process.env.RABBITMQ_VHOST || '%2f',
    queue: process.env.RABBITMQ_QUEUE || 'vote'
  }
};

if (debug) console.log('---Config---');
if (debug) console.log(JSON.stringify(config, null, 4));

var pool = new Pool(config.pg);

pool.query({
  text: `CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY,
    vote varchar(1) NOT NULL,
    ts bigint NOT NULL
  )`
  }).then(function(res) {
    console.log('votes Table Created')
  }).catch(function(err) {
    console.log('SQL Error:', err );
  });

var voteQueue = config.rabbitmq.queue;
var rabbitUrl = util.format('amqp://%s:%s@%s:%s/%s', config.rabbitmq.username, config.rabbitmq.password, config.rabbitmq.host, config.rabbitmq.port, config.rabbitmq.vhost);
var rConn = amqp.connect(rabbitUrl);

console.log('Starting Worker');
rConn.then(function(conn) {
    return conn.createChannel();
  }).then(function(ch) {
    return ch.assertQueue(voteQueue, {durable: false})
    .then(function(ok) {
      return ch.consume(voteQueue, function(msg) {
        if (msg !== null) {
          console.log('processing rabbitmq message: %s', msg.content.toString());
          var voteData = JSON.parse(msg.content);
          pool.query({
            text: 'INSERT INTO votes (id, vote, ts) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET vote = excluded.vote, ts = excluded.ts',
            values: [ voteData.voter_id, voteData.vote, voteData.ts ]
          }).then(function(results) {
            console.log('Inserted: %s %s', voteData.voter_id, voteData.vote);
            ch.ack(msg);
          }, function(err){
            console.log('SQL Error:', err );
          });
        }
      });
    });
  }).catch(console.warn);
