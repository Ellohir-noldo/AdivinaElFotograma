/* Setting things up. */
var fs = require('fs'),
    path = require('path'),
    express = require('express'),
    app = express(),   
    helpers = require(__dirname + '/helpers.js'),
    twitter = require(__dirname + '/twitter.js');

app.use(express.static('public'));


/* You can use uptimerobot.com or a similar site to hit your /BOT_ENDPOINT to wake up your app and make your Twitter bot tweet. */

app.all("/" + process.env.BOT_ENDPOINT, function (request, response) {
  twitter.respond_to_followers(function(tweets){
    
    var search_term = process.env.SEARCH_TERM;
    console.log("Looking for new tweets containing " + search_term);
    tweets.forEach(function(tweet) {
      /*
       The 'tweets' variable contains tweets from all of the bots followers. 'tweet' is each tweet separately.
        In the example below, the bot checks for tweets that contain the word "SEARCH_TERM" and responds to them.
      */
      
      
      if (tweet.text.includes(search_term)){
        
        console.log("NEW TWEET WITH #" + process.env.SEARCH_TERM + " FROM @" + tweet.user.screen_name + ": "+ tweet.id_str);    
        console.log(tweet.text);
        
        /* Now we can retweet each tweet with that. */
        twitter.retweet(tweet.id_str,
        function(err){
            console.log("ERROR WHILE RETWEETING");            
        });          
        
        
        /* OK THIS IS TOO MUCH
        
        twitter.reply_to_tweet(
          tweet,
          "Gracias por participar!",
          function(err){
            fs.writeFile(__dirname + '/last_tweet_id.txt', tweet.id_str);              
        });          
       
        */
        
      }
      
      fs.writeFile(__dirname + '/last_tweet_id.txt', tweet.id_str); 
    });      
  });
  
  /*************************************************************************************/
  /* TODO: Handle proper responses based on whether the tweets succeed, using Promises.
     For now, let's just return a success message no matter what. */
  response.sendStatus(200);
});


var listener = app.listen(process.env.PORT, function () {
  console.log('your bot is running on port ' + listener.address().port);
});
