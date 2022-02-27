const functions = require('firebase-functions');
const firebase = require('firebase-admin');
const moment = require('moment');
const axios = require('axios');

require('dotenv').config();
firebase.initializeApp();

async function postWebhook(data, webhook) {
  await axios({
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    url: webhook,
    data: JSON.stringify(data)
  });
}

exports.sendWebhook = functions.database.ref('/posts/{postId}/').onCreate(async (snapshot, context) => {
  console.log(`Received Post ${context.params.postId}`);

  const { timestamp, content, image } = snapshot.val();

  const time_formatted = moment(timestamp).format('h:mm A \- DD/MM/YYYY');

  const data = {
    "content": null,
    "embeds": [
      {
        "description": content,
        "color": 16711680,
        "footer": {
          "text": "Posted at " + time_formatted
        },
        "image": {
          "url": image
        }
      }
    ]
  }

  const webhooks = await firebase.database().ref('/webhooks/').once('value');

  webhooks.forEach(webhook => {
    postWebhook(data, webhook.val());
  });
});

exports.addWebhook = functions.database.ref('/webhooks/{channelId}').onCreate(async (snapshot, context) => {
  console.log(`Webhook Added ${context.params.channelId}`);
  
  const data = {
    "content": null,
    "embeds": [
      {
        "description": "Webhook added to system. This channel will now receive live Russia & Ukraine news.",
        "color": 16711680,
      }
    ]
  }

  postWebhook(data, snapshot.val());
});