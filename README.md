# Hally

[![Build Status](https://travis-ci.org/jcassee/hally.svg?branch=master)](https://travis-ci.org/jcassee/hally)
[![Coverage Status](https://coveralls.io/repos/jcassee/hally/badge.svg?branch=master&service=github)](https://coveralls.io/github/jcassee/hally?branch=master)
[![npm](https://img.shields.io/npm/v/hally.svg)](https://www.npmjs.com/package/hally)
[![npm downloads](https://img.shields.io/npm/dm/hally.svg)](https://www.npmjs.com/package/hally)
[![License](https://img.shields.io/github/license/jcassee/hally.svg)](https://github.com/jcassee/hally/blob/master/LICENSE.md)

JavaScript module for performing HTTP GET en PUT requests for
[JSON HAL](http://tools.ietf.org/html/draft-kelly-json-hal) resources.

Its main use is to embed linked resources, even when the server returns only the links.

## Example

    var hally = require('hally');
    var embed = hally.embed;

    hally.getHal('http://example.com/user', [
      embed('car'),
      embed('friends', [
        embed('car')
      ])
    ]).then(function (user) {
      console.log("User name: " + user.name);

      var car = user._embedded.car;
      console.log("Car brand: " + car.brand);

      user._embedded.friends.forEach(function (friend) {
        console.log(friend.name + "'s car brand: " + friend._embedded.car.brand);
      });

      car.brand = 'Ford';
      return hally.putState(car).then(function (response) {
        // Do something with PUT response
      });
    });


## Installation

Install using NPM

    npm install hally --save

Hally uses [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises).
Promises are [available on most modern platforms](https://kangax.github.io/compat-table/es6/#test-Promise),
but older environments may require a [polyfill](https://github.com/stefanpenner/es6-promise).
