// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));
app.use(express.static('assets'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// Define port
const PORT = process.env.PORT || 3000;

// listen for requests
app.listen(PORT, (error) => {
  if (error) {
    console.error('Error starting server:', error);
    return;
  }
  console.log(`Server is running on port ${PORT}`);
});
