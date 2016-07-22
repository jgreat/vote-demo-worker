var amqp = require('amqplib');
var sql = require('seriate');
var envs = require('envs');
var util = require('util');

var debug = envs('DEBUG');
var config = {
  sql: {
    host: envs('SQL_HOST', 'localhost'),
    user: envs('SQL_USERNAME', 'guest'),
    password: envs('SQL_PASSWORD', 'guest'),
    database: envs('SQL_DATABASE', 'master'),
    options: {
      encrypt: true // Use this if you're on Windows Azure
    }
  },
  rabbitmq: {
    host: envs('RABBITMQ_HOST', 'localhost'),
    username: envs('RABBITMQ_USERNAME', 'guest'),
    password: envs('RABBITMQ_PASSWORD', 'guest'),
    port: envs('RABBITMQ_PORT', '5672'),
    vhost: envs('RABBITMQ_VHOST', '%2f'),
    queue: envs('RABBITMQ_QUEUE', 'vote')
  }
};

if (debug) console.log('---Config---');
if (debug) console.log(JSON.stringify(config, null, 4));

sql.setDefaultConfig( config.sql );

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
          var params = {
            id: {
              val: voteData.voter_id,
              type: sql.VARCHAR(255),
            },
            vote: {
              val: voteData.vote,
              type: sql.VARCHAR(255),
            },
            ts: {
              val: voteData.ts,
              type: sql.BIGINT,
            }
          };
          sql.execute({
            query: 'INSERT INTO dbo.votes (id, vote, ts) VALUES (@id, @vote, @ts)',
            params: params
          }).then(function(results) {
            console.log('Inserted: %s %s', voteData.voter_id, voteData.vote);
            ch.ack(msg);
          }, function(err){
            // insert failed becasue id already exists
            if (err.number === 2627) {
              sql.execute({
                query: 'UPDATE dbo.votes SET vote = @vote, ts = @ts WHERE id = @id AND ts < @ts',
                params: params
              }).then(function(results) {
                console.log('Updated: %s %s', voteData.voter_id, voteData.vote);
                ch.ack(msg);
              }, function(err){
                console.log('SQL Error:', err );
              });
            } else {
              console.log('SQL Error:', err );
            }
          });
        }
      });
    });
  }).catch(console.warn);
