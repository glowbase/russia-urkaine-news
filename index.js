require('dotenv').config();

const fs = require('fs');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const { parse } = require('node-html-parser');

// Allow axios to retry the connection since the site being scraped
// seems to spit out HTTP 500 errors all over the place
axiosRetry(axios, {
  retries: 50,
  retryDelay: retryCount => {
    return retryCount * 2000; // Wait 2 seconds before retrying
  },
  retryCondition: error => {
    console.log('Retrying...');

    return error.response.status.toString().startsWith('5'); // Retry if it's a 500 error
  },
});

async function newsUpdates() {
  const url = 'https://liveuamap.com';
  const { data } = await axios.get(url);

  // Parse response so we can use it like normal HTML
  const newsFeed = parse(data).querySelector('#feedler');
  const newsResults = [];

  // Keep track of the update id's so we don't post duplicates
  const { ids } = require('./sent.json');
  const sentIds = { ids: ids };

  const formattedId = newsFeed.childNodes[0].id.split('-')[1];

  // If there is an image let's display it, otherwise return null
  const image = newsFeed.childNodes[0].querySelector('.img').childNodes;
  const formattedImage = image.length ? newsFeed.childNodes[0].querySelector('.img').querySelector('img').getAttribute('src') : null

  // They don't format their time nicely, so let's fix that (it's terrible I know)...
  const time = newsFeed.childNodes[0].querySelector('.date_add').innerText.trim();
  const formattedTime = `${time.split(' ')[0]}${(time.split(' ')[0] == 1) ? time.split(' ')[1] : time.split(' ')[1] + 's'} ago`;

  // TODO: Make the @username's bolded, because why not
  const formattedTitle = newsFeed.childNodes[0].querySelector('.title').innerText.trim();

  if (ids.includes(formattedId)) return; // Don't post if we have already

  newsResults.push({
    id: formattedId,
    time: formattedTime,
    title: formattedTitle,
    image: formattedImage,
  });
  sentIds.ids.push(formattedId);
  
  // Send Discord webhook
  axios({
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    url: process.env.WEBHOOK,
    data: JSON.stringify({
      "content": null,
      "embeds": [
        {
          "description": formattedTitle,
          "color": 16711680,
          "footer": {
            "text": "Posted " + formattedTime
          },
          "image": {
            "url": formattedImage
          }
        }
      ]
    })
  }).catch(error => {
    console.log(error.message);
  });

  console.log('NEW ID:', formattedId);

  // Save posted id's so it's persistent if the scraper needs to be restarted
  fs.writeFileSync('./sent.json', JSON.stringify(sentIds))

  console.log('RETREIVED INFORMATION');
}

newsUpdates();

setInterval(() => {
  newsUpdates();
}, 1000 * 60); // Run every minute