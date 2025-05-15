const express = require("express");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "dashboard")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "about.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "contact.html"));
});

async function scrapeSearchResults(query) {
  const url = `https://ww25.soap2day.day/search/${encodeURIComponent(query)}`;
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const results = [];

    const sections = ['#movies .ml-item', '#tvshows .ml-item'];

    sections.forEach((selector) => {
      const isTv = selector.includes('tv');

      $(selector).each((_, el) => {
        const element = $(el);
        const title = element.find('.h2').text().trim();
        if (!title.toLowerCase().includes(query.toLowerCase())) return;

        const anchor = element.find('a');
        const link = anchor.attr('href');
        const image = anchor.find('img').attr('data-original')?.trim();
        const imdb = element.find('.imdb').text().trim();
        const episode = element.find('.mli-eps i').text().trim();

        const hiddenTip = element.find('#hidden_tip');
        const year = hiddenTip.find('.jt-info a[rel="tag"]').first().text().trim();
        const country = hiddenTip.find('.block').first().find('a').text().trim();
        const genres = [];

        hiddenTip.find('.block').last().find('a').each((_, genre) => {
          genres.push($(genre).text().trim());
        });

        results.push({
          title,
          link,
          image,
          imdb,
          year,
          country: country || null,
          genres,
          type: isTv ? 'tv' : 'movie',
          episodes: episode || undefined,
        });
      });
    });

    return results;
  } catch (err) {
    throw new Error('Failed to scrape: ' + err.message);
  }
}

app.post('/api/movies', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing "query" in request body' });
  }

  try {
    const results = await scrapeSearchResults(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/movie', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing "url" in request body' });
  }

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const title = $('#bread li.active span').text().trim().replace('Text from here: ', '');
    const poster = $('.thumb.mvi-cover').css('background-image')
      .replace(/^url["']?/, '')
      .replace(/["']?$/, '');
    const rating = $('#movie-mark').text().trim();

    const servers = [];
    $('#content-embed iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) servers.push(src);
    });

    let description = $('.desc .f-desc').text().trim();
    description = description.replace(/You can view it for free on Soap2day\.?/i, '').trim();

    res.json({ title, poster, rating, servers, description });
  } catch (error) {
    res.status(500).json({ error: 'Failed to scrape data', details: error.message });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});
