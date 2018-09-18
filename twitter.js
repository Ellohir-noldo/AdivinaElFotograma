var fs = require('fs'),
    path = require('path'),
    helpers = require(__dirname + '/helpers.js'),
    config = {
    /* Be sure to update the .env file with your API keys. See how to get them: https://botwiki.org/tutorials/how-to-create-a-twitter-app */      
      twitter: {
        username: process.env.BOT_USERNAME,
        consumer_key: process.env.CONSUMER_KEY,
        consumer_secret: process.env.CONSUMER_SECRET,
        access_token: process.env.ACCESS_TOKEN,
        access_token_secret: process.env.ACCESS_TOKEN_SECRET
      }
    },
    Twit = require('twit'),
    T = new Twit(config.twitter),
    stream = T.stream('statuses/sample'),
    currentFollowers = [],
    saved_followers = [],
    users_to_unfollow = [],
    users_to_follow = [],
    api_delay_index = 0;

module.exports = {
  
  respond_to_followers: function(cb){
    var twitter = this;
    twitter.update_followers(cb);
  },
  
  update_followers: function(cb, cursor){
    console.log('updating followers...');
    var twitter = this;
    
    fs.readFile(__dirname + '/saved_followers.txt', 'utf8', function (err, data) {
      if (err){
        console.log('Error', err);
      }
      if (data.trim().length){
        saved_followers = data.split(',').map(function(idStr){
          return parseInt(idStr);
        });

        if (typeof saved_followers === 'string'){
          saved_followers = [saved_followers];
        }
      }
      else{
        saved_followers = [];
      }

      var options = {
        screen_name: process.env.BOT_USERNAME,
        count: 5000       
      };

      if (cursor){
        options.cursor = cursor;
      }

      T.get('followers/ids', options, function(err, data, response) {

        if (err){
          console.log('Error!', err);
        }

        if (data.ids){
          data.ids.forEach(function(userId) {
            currentFollowers.push(userId)
          });
        }

        if (data.next_cursor !== 0){
          api_delay_index++;
          setTimeout(function(){
            twitter.update_followers(cb, data.next_cursor_str);      
          }, api_delay_index * 1000);
        }
        else{
          twitter.clean_up_followers(cb);
        }
      });    
    });
  },
  
  
  clean_up_followers: function(cb){
    var twitter = this;
    var new_followers = [], unfollowers = [];

    console.log('saved followers', saved_followers);
    console.log('current followers', currentFollowers);

    fs.writeFile(__dirname + '/saved_followers.txt', currentFollowers.join(','), function (err) {
      /* TODO: Error handling? */
    });  

    currentFollowers.forEach(function(user_id){
      if (saved_followers.indexOf(user_id) === -1){
        new_followers.push(user_id);
      }
    });

    saved_followers.forEach(function(user_id){
      if (currentFollowers.indexOf(user_id) === -1){
        unfollowers.push(user_id);
      }
    });

    console.log('unfollowers', unfollowers);
    console.log('new followers', new_followers);  

    api_delay_index = 0;

    var newFollowersFn = function followNewFollower(follower, index){          
      return new Promise(function(resolve){
        return setTimeout(function(){
          T.post('friendships/create', { user_id: follower }, function(err, data, response) {
            if (err){
              //TODO: Error handling?
              console.log('Error!', err);
            } else {
              console.log(`Followed user with ID ${follower}`);
              return resolve(follower, index);
            }
          })
        }, index * 1000);          
      });
    }

    var unfollowersFn = function unfollowUnfollowers(follower, index){
      return new Promise(function(resolve){
        return setTimeout(function(){
          T.post('friendships/destroy', { user_id: follower }, function(err, data, response) {
            if (err){
              //TODO: Error handling?
              console.log('Error!', err);
            } else {
              console.log(`Unfollowed user with ID ${follower}`);
              return resolve(follower, index);
            }
          })
        }, index * 1000);          
      });
    }

    var actions = unfollowers.map(unfollowersFn).concat(new_followers.map(newFollowersFn));
    var results = Promise.all(actions);  

    results.then(function (follower, index) {
      return (
        twitter.respond_to_followers_callback(cb)
      );
    });   
  },
  
  
  
  respond_to_followers_callback: function (cb){
   fs.readFile(__dirname + '/last_tweet_id.txt', 'utf8', function (err, last_tweet_id) {
      /* First, let's load the ID of the last tweet we responded to. */
      console.log('last_tweet_id:', last_tweet_id);

     /* GET ALL TWEETS */
     /* Next, we'll load the bot's timeline. */
     T.get('statuses/home_timeline', { since_id: last_tweet_id}, function(err, data, response) {
        if (data && cb){
          cb(data);
        } else {
          /* None of our followers tweeted since the last time we checked. */
          console.log('No new tweets...');      
        }
      });    
    });  
  },
  
  
  
  tweet: function(text, cb){
    T.post('statuses/update', { status: text }, function(err, data, response) {
      cb(err, data, response);
    });    
  },  
  
  retweet: function(id_tweet, cb){
    T.post('statuses/retweet/:id', {
            id: id_tweet
    }, function(err, data, response) {
      cb(err, data, response);
    });  
  },  
  
  
  reply_to_tweet: function(tweet, text, cb){
    if (tweet.user.screen_name !== process.env.BOT_USERNAME){
      T.post('statuses/update', {
        status: `@${tweet.user.screen_name} ${text}`,
        in_reply_to_status_id: tweet.id_str
      }, function(err, data, response) {
        if (!err){
          fs.writeFile(__dirname + '/last_tweet_id.txt', tweet.id_str, function (err) {
            /* TODO: Error handling? */
          });
        }
        cb(err);
      });
    }
  },  
  
  
  
  
  send_dm: function(sender_id, message_text, cb){
    T.post('direct_messages/new', {
      user_id: sender_id,
      text: message_text
    }, function(err, data, response) {
      if(cb){
        cb(err);
      }      
    });  
  },  
  
  
  
  post_image: function(text, image_base64, cb) {
   T.post('media/upload', { media_data: image_base64 }, function (err, data, response) {
      if (err){
        console.log('ERROR:\n', err);
        if (cb){
          cb(err);
        }
      }
      else{
        console.log('tweeting the image...');
        T.post('statuses/update', {
          status: text,
          media_ids: new Array(data.media_id_string)
        },
        function(err, data, response) {
          if (err){
            console.log('ERROR:\n', err);
            if (cb){
              cb(err);
            }
          }
          else{
            console.log('tweeted!');
            if (cb){
              cb(null);
            }
          }
        });
      }
    });
  },
  
  
  
  update_profile_image: function(image_base64, cb) {
    console.log('updating profile image...');
    T.post('account/update_profile_image', {
      image: image_base64
    },
    function(err, data, response) {
      if (err){
        console.log('ERROR:\n', err);
        if (cb){
          cb(err);
        }
      }
      else{
        if (cb){
          cb(null);
        }
      }
    });
  },
  
  
  
  delete_last_tweet: function(cb){
    console.log('deleting last tweet...');
    T.get('statuses/user_timeline', { screen_name: process.env.BOT_USERNAME }, function(err, data, response) {
      if (err){
        if (cb){
          cb(err, data);
        }
        return false;
      }
      if (data && data.length > 0){
        var last_tweet_id = data[0].id_str;
        T.post(`statuses/destroy/${last_tweet_id}`, { id: last_tweet_id }, function(err, data, response) {
          if (cb){
            cb(err, data);
          }
        });
      } else {
        if (cb){
          cb(err, data);
        }
      }
    });
  }  
  
  
  
};