const rp = require('request-promise');

const searchLocation = (lat, lng, songkickApi) => {
  const params = {
    url: `http://api.songkick.com/api/3.0/search/locations.json?location=geo:${lat},${lng}&apikey=${songkickApi}`,
    method: 'GET',
    json: true
  };

  return rp(params);
};

function searchUpcomingEvents(metroId, songkickApi) {
  const params = {
    url: `http://api.songkick.com/api/3.0/metro_areas/${metroId}/calendar.json?apikey=${songkickApi}`,
    method: 'GET',
    json: true
  };
  console.log(params.url);
  return rp(params);
}

module.exports = {
  searchLocation,
  searchUpcomingEvents
};

