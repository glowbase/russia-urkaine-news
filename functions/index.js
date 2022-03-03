const functions = require('firebase-functions');
const { parse } = require('node-html-parser');
const firebase = require('firebase-admin');
const axiosRetry = require('axios-retry');
const axios = require('axios');
const fs = require('fs');

require('dotenv').config();

firebase.initializeApp({
  databaseURL: "https://glowbase-portfolio-default-rtdb.asia-southeast1.firebasedatabase.app"
});

axiosRetry(axios, { retries: 50,
  retryDelay: () => { return 0 },
  retryCondition: error => {
    return error.response.status.toString().startsWith('5');
  },
});

/**
 * 
 * @param {*} imageUrl 
 * @param {*} postId 
 * @returns 
 */
async function downloadFile(imageUrl, postId) {
  try {
    const { data } = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
      headers: {
        'Origin': 'https://liveuamap.com'
      }
    });
  
    data.pipe(fs.createWriteStream(`/tmp/${postId}.jpg`));

    return true;
  } catch (err) {
    return false;
  }
}


/**
 * 
 * @param {*} postId 
 * @returns 
 */
async function uploadFile(postId) {
  await firebase.storage().bucket('russia-ukraine-news').upload(`/tmp/${postId}.jpg`, {
    destination: `${postId}.jpg`,
  });

  return `https://storage.googleapis.com/russia-ukraine-news/${postId}.jpg`;
}


async function getImage(html, postId) {
  const image = html.querySelector('img');

  if (!image) return '';

  const result = await downloadFile(image.getAttribute('src'), postId);

  if (!result) return '';

  const url = await uploadFile(postId);

  return url;
}


/**
 * 
 * @param {*} html 
 * @returns 
 */
 function getTime(html) {
  const time = html.querySelector('.date_add').innerText.split(' ');
  let time_difference = time[0];

  if (time[1] === 'hour') {
    time_difference = time_difference * 3600000;
  } else {
    time_difference = time_difference * 60000;
  }

  return new Date().getTime() - time_difference;
}


/**
 * 
 * @returns 
 */
async function getPostHTML() {
  const { data } = await axios.get('https://liveuamap.com');
  const post_html = parse(data).querySelector('#feedler').childNodes[0];

  return {
    html: post_html,
    id: post_html.id.replace('post-', '')
  };
}


/**
 * 
 * @param {*} html 
 * @returns 
 */
async function extractPostData(html) {
  const id = html.id.replace('post-', '');
  const image = await getImage(html, id);
  const time = getTime(html);

  return {
    content: html.querySelector('.title').innerText,
    timestamp: time,
    image: image,
  }
}


/**
 * 
 * @param {*} data 
 * @param {*} webhook 
 */
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


/**
 * 
 */
exports.sendWebhook = functions.database.ref('/posts/{postId}/').onCreate(async (snapshot, context) => {
  console.log(`Received Post ${context.params.postId}`);

  const { timestamp, content, image } = snapshot.val();

  const data = {
    "content": null,
    "embeds": [
      {
        "description": content,
        "color": 16711680,
        "footer": {
          "text": "Posted",
        },
        "timestamp": new Date(timestamp).toISOString(),
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


/**
 * 
 */
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


/**
 * 
 */
exports.getPost = functions.pubsub.schedule('* * * * *').timeZone('Australia/Sydney').onRun(async () => {
  const { html, id } = await getPostHTML();
  
  const postExists = await firebase.database().ref(`/posts/${id}`).once('value');

  if (postExists.val()) return console.log('NO UPDATE');
  
  const post = await extractPostData(html);

  await firebase.database().ref('/posts/').update({
    [id]: post
  });

  console.log('ADDED POST:', id);

  return null;
});