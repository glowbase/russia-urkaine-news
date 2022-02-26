const fs = require('fs');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const firebase = require('firebase-admin');
const { parse } = require('node-html-parser');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage({ keyFilename: "gcp_key.json" });
const serviceAccount = require("./gcp_key.json");

require('dotenv').config();

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: "https://glowbase-portfolio-default-rtdb.asia-southeast1.firebasedatabase.app"
});

axiosRetry(axios, { retries: 50,
  retryDelay: () => { return 0 },
  retryCondition: error => {
    console.log('Retrying...');
    return error.response.status.toString().startsWith('5');
  },
});

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
  
    data.pipe(fs.createWriteStream(`./${postId}.jpg`));

    return true;
  } catch (err) {
    return false;
  }
}

async function uploadFile(postId) {
  await storage.bucket('russia-ukraine-news').upload(`./${postId}.jpg`, {
    destination: `${postId}.jpg`,
  });

  return `https://storage.googleapis.com/russia-ukraine-news/${postId}.jpg`;
}

async function getPostHTML() {
  const { data } = await axios.get('https://liveuamap.com');
  const post_html = parse(data).querySelector('#feedler').childNodes[0];

  return post_html;
}

function getTime(html) {
  const time = html.querySelector('.date_add').innerText.split(' ');
  let time_difference = time[0];

  if (time[1] === 'hour') {
    time_difference = time_difference * 3600000;
  } else {
    time_difference = time_difference * 60000;
  }

  const time_now = new Date().getTime();

  return time_now - time_difference;
}

async function getImage(html, id) {
  const image = html.querySelector('img');

  if (!image) return '';

  const result = await downloadFile(image.getAttribute('src'), id);

  if (!result) return '';

  const url = await uploadFile(id);

  fs.unlinkSync(`./${id}`);

  return url;
}

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

async function getPost() {
  const html = await getPostHTML();
  const id = html.id.replace('post-', '');

  const exists = await firebase.database().ref(`/posts/${id}/`).once('value');
  
  if (!exists.val()) {
    const post = await extractPostData(html);
  
    await firebase.database().ref('/posts/').update({
      [id]: post
    });

    console.log('ADDED POST:', id);
  } else {
    console.log('NO UPDATE');
  }

  process.exit();
}

getPost();