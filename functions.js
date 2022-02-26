const functions = require('firebase-functions');
const axios = require('axios');

require('dotenv').config();

async function postWebhook(post, webhook) {
  const time_formatted = moment(post.timestamp).format('h:mm A \- DD/MM/YYYY');

  await axios({
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    url: webhook,
    data: JSON.stringify({
      "content": null,
      "embeds": [
        {
          "description": post.content,
          "color": 16711680,
          "footer": {
            "text": "Posted at " + time_formatted
          },
          "image": {
            "url": post.image
          }
        }
      ]
    })
  });
}

exports.webhook = functions.database.ref('/posts/{postId}/').onCreate(async (snapshot, context) => {
  console.log(`Received Post ${snapshot.key} - Sending Webhook...`);

  postWebhook(snapshot.val(), process.env.WEBHOOK);
});