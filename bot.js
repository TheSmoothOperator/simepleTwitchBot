import { CronJob as cron } from 'cron'
import { RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth'
import { ChatClient } from 'twitch-chat-client'
import { promises as fs } from 'fs'
import { ApiClient } from 'twitch'
import  mysql from 'mysql2'


//Comment me out if you do not want to utilize MySQL logging
var connection = mysql.createConnection({
  host     : 'localhost',   //IP of the MySQL server : default is localhost for an instance in the same location
  user     : 'USER',        //MySQL username
  password : 'PASSWORD',    //MySQL password
  database : 'twitch'       //MySQL default database
});

connection.connect();

// Pre get your Twitch user ID. You can get this from uncommenting line #49 and running the application once. It will show up in the console with the twitch user ID. 
const tuID = '123456789'

async function main() {
    const clientId = 'CLIENT_ID'                                                      //This is the client ID for your bot. You can get this from dev.twitch.com
    const clientSecret = 'CLIENT_SECRET'                                              //Similar to the clientID. Grab this from dev.twitch.com
    const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'UTF-8'))         //Used to keep and refresh your bots token
    const highRollers = JSON.parse(await fs.readFile('./highrollers.json', 'UTF-8'))  //Used to keep track of the people who rolled high (20) on !d20

    const authProvider = new RefreshableAuthProvider(
        new StaticAuthProvider(clientId, tokenData.accessToken),
        {
            clientSecret,
            refreshToken: tokenData.refreshToken,
            expiry: tokenData.expiryTimestamp === null ? null : new Date(tokenData.expiryTimestamp),
            onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
                const newTokenData = {
                    accessToken,
                    refreshToken,
                    expiryTimestamp: expiryDate === null ? null : expiryDate.getTime()
                };
                await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
            }
        }
    )
    const apiClient = new ApiClient({ authProvider })
    const chatClient = new ChatClient(authProvider, { channels: ['thesmoothoperator'] }) //Choose the channel you want the bot to join
    await chatClient.connect()

    //Get your userID
    //console.dir(apiClient.helix.users.getUserByName('USERNAME')) // Replace USERNAME with your twitch username

    //Message commands
    chatClient.onMessage((channel, user, message) => {

      const commandName = message.trim().toLowerCase()
      
      if (commandName === '!roll') {
        const num = rollDice();
        chatClient.say(channel,`@${user} rolled a ${num}`);
        console.log(`* Executed ${commandName} command`);
      } else if (commandName === '!d20') {
        const d20 = rollD20();
        if(d20 === 20){
          chatClient.say(channel,`HOLY CRAP! @${user} just rolled a ${d20}! @${user} has been added to the "Hall of Highrollers"`)
          var findU = -1
          for(var i = 0; i < highRollers.roller.length; i++){
            if(highRollers.roller[i].name === user && highRollers.roller[i].channel === channel){
              findU = i
            }
          }
          if(findU >= 0){
            highRollers.roller[findU].count = highRollers.roller[findU].count + 1
          } else{
            highRollers["roller"].push({"name":`${user}`,"count":1, "channel":`${channel}`})
          }
          fs.writeFile('./highrollers.json', JSON.stringify(highRollers), 'UTF-8')
        } else {
          chatClient.say(channel,`@${user} rolled a ${d20}`);
        }
        console.log(`* Executed ${commandName} command`);
      } else if (commandName === '!uptime'){
        var runner = tuID           //If you want to use multiple channels, make sure to add a loop/conditional to change this runner.
        apiClient.helix.users.getUserById(runner)
        .then((userName) =>{
          userName.getStream()
          .then((stream) =>{
            if (stream !== null){
              chatClient.say(channel,calcTime(stream.startDate,stream.userDisplayName))
              console.log(`* Executed ${commandName} command`);
            } else {
              chatClient.say(channel,`I'm sorry ${user}. ${userName.displayName} is not live right now.`)
              console.log(`* Executed ${commandName} command`);
            }
          })
        })

      } else if (commandName === '!followage'){
        apiClient.helix.users.getUserByName(user)
        .then((userID) => {
          apiClient.helix.users.getFollows({followedUser:lisID,user:userID.id})
          .then(info => {
            if (info.data.length > 0) {
              chatClient.say(channel,calcDate(info.data[0].followDate,info.data[0].userDisplayName))
            } else{
              chatClient.say(channel, `I am sorry ${user}. It seems you are not following ${channel}`)
            }
            console.log(`* Executed ${commandName} command`)
          })
        })
      } else if (commandName === '!highrollers'){
        highRollers.roller.forEach((x) => {
          if(x.channel === channel){
            chatClient.say(channel, `@`+ x.name + ` has rolled a perfect score ` + x.count + ` times`)
          }
        })
        console.log(`* Executed ${commandName} command`)
      } else if (commandName === '!commands'){
        const commands = ['!roll : Rolls a 6 sided die',
          '!d20 : Rolls a 20 sided die',
          '!uptime : How long the stream has been going',
          '!followage : How long you have been following',
          '!highrollers : Who has the best luck',
          '!commands : This list of commands'
        ]
        chatClient.say(channel,`List of commands:`) 
        var message = ''
        for(var i = 0; i < 5; i++){
          message += commands[i] + ' || '
        }
        chatClient.say(channel,message)
        var message = ''
        for(var i = 5; i < commands.length; i++){
          message += commands[i] + ' || '
        }
        chatClient.say(channel,message)
        console.log(`* Executed ${commandName} command`)
      } else {
        //do nothing since it isn't a command
      }
      
      //Comment me out if you do not want to use MySQL logging
      connection.query('INSERT INTO chatlog SET ?', {channel: channel, user: user, message: message.trim()}, function (error, results, fields) {
      if (error) throw error;
      });
    });
    
    chatClient.onSub((channel, user) => {
      chatClient.say(channel, `Thanks to @${user} for subscribing to the channel!`);
    });
    chatClient.onResub((channel, user, subInfo) => {
      chatClient.say(channel, `Thanks to @${user} for subscribing to the channel for a total of ${subInfo.months} months!`);
    });
    chatClient.onSubGift((channel, user, subInfo) => {
      chatClient.say(channel, `Thanks to ${subInfo.gifter} for gifting a subscription to ${user}!".`);
    });

    chatClient.onRaid((channel, user, raidInfo, msg) =>{
      chatClient.say(channel,`WAIT! WHAT IS THIS? ${user} IS RAIDING THE STREAM?!? RUN! HIDE YOUR KIDS! HIDE YOUR WIVES!...... Oh... it's one of *THOSE* types of raids. Well here is the information about the raid: Viewers arriving = ${raidInfo.viewerCount} ... Please don\'t scare me like that!`)
    })

    // This is a CRON job that you can set the timer for when you want to automatically speak for you. Currently set to once everyone 40 minutes.
    var Message_job = new cron('0 */40 * * * *', function() {
      chatClient.say('CHANNELNAME', randomBotSay());      //REPLACE CHANNEL_NAME with your channel name
    }, null, true, 'America/Chicago');                    //Change the timezone to follow your own area
    Message_job.start();
}

main();

//Function called when the "roll" command is issued
function rollDice () {
  const sides = 6
  return Math.floor(Math.random() * sides) + 1
}
//Function called when the "d20" command is issued. Can be changed to whatever amount of sides or duplicated 
function rollD20 () {
  const sides = 20
  return Math.floor(Math.random() * sides) + 1
}

//Used to calculate the amount of time someone has been following. Uses "dirty" time of 30 days for the month category. Not 100% accurate. Looking to change this later down the road if needed.
function calcDate(date,userName) {
  var date1 = new Date()
  var date2 = date
  var time = Math.abs(date1.getTime() - date2.getTime())
  var years = Math.floor(time/(1000*3600*24*31*12))
  var months = Math.floor(time/(1000*3600*24*30)) % 12
  var days = Math.floor(time/(1000*3600*24)) % 30
  var hours = Math.floor(time/(1000*3600)) % 24
  var minutes = Math.floor(time/(1000*60)) % 60
  var seconds = Math.floor(time/(1000)) % 60
  
  var message = userName + ' has been following for '
  //message += years + " years "
  message += months + " months, "
  message += days + " days, "
  message += hours + ' hours, '
  message += minutes + ' minutes, '
  message += seconds + ' seconds '
  
  return message
}

//Used to calculate the amount of time the user has been streaming. Not really needed anymore since Twitch implemented it into the player, but still nice to have.
function calcTime(date,userName) {
  var date1 = new Date()
  var date2 = date
  var time = Math.abs(date1.getTime() - date2.getTime())
  var hours = Math.floor(time/(1000*3600)) % 24
  var minutes = Math.floor(time/(1000*60)) % 60
  var seconds = Math.floor(time/(1000)) % 60

  var message = userName + ' has been streaming for '
  message += hours + ' hours, '
  message += minutes + ' minutes, '
  message += seconds + ' seconds '

  return message
}

function randomBotSay () {

  const statement = [
    'HI! I am a bot created by TheSmoothOperator. Go check out his github @ https://github.com/thesmoothoperator',
    'Wow! I sent a message to your chat. How did I get here? You must have gotten my code from TheSmoothOperator @ https://github.com/thesmoothoperator',
    'Please make sure to give proper credit to TheSmoothOperator @ https://github.com/thesmoothoperator . He put a lot of time into creating me!',
    'Zzzzzzz. Zzzzzz. Zzzzzz. It\'s all a dream..... I want to be a real person....... Visit https://github.com/thesmoothoperator to download me and make me a real person.',
    'Curious to check how long the stream has been going? Try !uptime .',
    'How long have you been following? Try !followage .'
  ]
  return statement[Math.floor(Math.random() * statement.length)]
  
}

