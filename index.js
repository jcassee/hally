'use strict';

var uriTemplates = require('uri-templates');


/**
 * Module for performing HTTP GET en PUT requests for HAL resources.
 *
 * The main use is to embed linked resources, even when the server returns only the links.
 *
 * ### Example
 *
 * ```
 * var hally = require('hally');
 * var embed = hally.embed;
 *
 * hally.getHal('http://example.com/user', [
 *   embed('car'),
 *   embed('friends', [
 *     embed('car')
 *   ])
 * ]).then(function (user) {
 *   console.log("User name: " + user.name);
 *
 *   var car = user._embedded.car;
 *   console.log("Car brand: " + car.brand);
 *
 *   for (let friend of user._embedded.friends)) {
 *     console.log(friend.name + "'s car brand: " + friend._embedded.car.brand);
 *   }
 *
 *   car.brand = 'Ford';
 *   return hally.putState(car).then(function (response) {
 *     // Do something with PUT response
 *   });http://example.com
 * });
 * ```
 *
 * @module hally
 */


/**
 * A link to another resource.
 *
 * @typedef {Object} Link
 * @property {string}  href          - The reference of the target resource; a URI or a URI Template.
 * @property {boolean} [templated]   - Indicates whether the href is a URI Template.
 * @property {string}  [type]        - The media type of the target resource.
 * @property {string}  [deprecation] - A URL to information about the deprecation of the link.
 * @property {string}  [name]        - A secondary key for selecting links that share the same relation type.
 * @property {string}  [profile]     - The profile of the target resource; a URI.
 * @property {string}  [title]       - A human-readable identification of the link.
 * @property {string}  [hreflang]    - The language of the target resource.
 */


/**
 * A HAL resource.
 *
 * Although the _links and _embedded properties are optional according to the RFC,
 * this module always creates them to make traversal simpler.
 *
 * @typedef {Object} Hal
 * @property {Object.<string, Link|Link[]>} _links - Links to related resources.
 * @property {Object.<string, Hal|Hal[]>} _embedded - Embedded Hal resources.
 */


/**
 * Follow a link relation and return the URI of the target resource(s).
 *
 * If the resource has no links with the relation type but does contains an
 * embedded resource (or resources), the self link of the embedded resource(s)
 * is used.
 *
 * @param {Hal} resource the subject resource
 * @param {string} rel the link relation type
 * @param {Object.<string, Object>} [params] parameters to expand the target href URI Template with
 * @returns {string|string[]|undefined} the target URI(s)
 */
function linkHref(resource, rel, params) {
  var link = resource._links[rel];
  if (!link) {
    // Fall through
  } else if (!Array.isArray(link)) {
    return resolveUri(link.href, params);
  } else {
    return link.map(function (l) {
      return resolveUri(l.href, params);
    });
  }

  var embedded = resource._embedded[rel];
  if (!embedded) {
    // Fall through
  } else if (!Array.isArray(embedded)) {
    return embedded._links.self.href;
  } else {
    return embedded.map(function (e) {
      return e._links.self.href;
    });
  }

  return undefined;
}

/**
 * Either pass through a URI unchanged, or resolve a URI Template if parameters are given.
 *
 * @param {string} uri The URI or URI Template
 * @param {Object.<string, Object>} [params] URI Template parameters
 * @return {string} the resulting URI
 */
function resolveUri(uri, params) {
  if (uri && params) {
    uri = uriTemplates(uri).fillFromObject(params);
  }
  return uri;
}


/**
 * A resource context contains for every URI:
 * - undefined if it has not been requested, or
 * - a promise of a resource if it has been requested, or
 * - a resource if the request has completed.
 *
 * @typedef {Object.<string, Hal|Promise<Hal>>} Context;
 */


/**
 * Add a HAL resource to the context.
 *
 * @param {Context} context the resource context
 * @param {Hal} resource the HAL resource
 */
function addToContext(context, resource) {
  context[resource._links.self.href] = resource;

  // Make sure _embedded exists so users can safely write "resource._embedded[rel]"
  if (!('_embedded' in resource)) {
    resource._embedded = {};
  }

  // Also add any embedded resources
  Object.keys(resource._embedded).forEach(function (rel) {
    var embeds = resource._embedded[rel];
    embeds = Array.isArray(embeds) ? embeds : [embeds];
    embeds.forEach(function (embed) {
      addToContext(context, embed);
    });
  });
}


/**
 * An embed request is an object containing information about what HAL
 * resources to embed. The resources are embedded even if they were
 * linked but not embedded by the server.
 *
 * @typedef {Object} EmbedRequest
 * @property {string}         rel      - The link relation.
 * @property {EmbedRequest[]} children - An array of embed requests for the embedded resource.
 */


/**
 * Get a HAL resource.
 *
 * @param {string} uri - The resource URI.
 * @param {EmbedRequest[]} embeds  - Embed requests for the resource.
 * @param {Context}        context - The resource context to store resources in.
 *
 * @returns {Promise<Hal>} A promise that resolves to the HAL resource.
 */
function getResource(uri, embeds, context) {
  var promise;
  if (uri in context) {
    promise = Promise.resolve(context[uri]);
  } else {
    promise = fetch(uri, {headers: {'Accept': 'application/hal+json'}})
        .then(function (response) {
          return response.json();
        })
        .then(function (resource) {
          addToContext(context, resource);
          return resource;
        });
  }
  context[uri] = promise;
  return promise.then(function (resource) {
    return getAndEmbedLinks(resource, embeds, context);
  });
}

/**
 * For all embed requests, get the linked resources and embed them.
 *
 * @param {Hal} resource - The HAL resource to process.
 * @param {EmbedRequest[]} embeds - The embed requests.
 * @param {Context} context - The resources context. Makes sure each resource is requested only once.
 *
 * @return {Promise<Hal>} A promise that resolve to the resource after all resources are embedded.
 */
function getAndEmbedLinks(resource, embeds, context) {
  var embedPromises = embeds.map(function (embed) {
    return getAndEmbedLink(resource, embed, context);
  })
  return Promise.all(embedPromises)
      .then(function (/* ignore embedding result */) {
        return resource;
      });
}

/**
 * Get linked resources and embed them.
 *
 * @param {Hal} resource - The HAL resource to process.
 * @param {EmbedRequest} embed - The embed request.
 * @param {Context} context - The resources context. Makes sure each resource is requested only once.
 *
 * @return {Promise<Hal>} A promise that resolve to the resource after all resources are embedded.
 */
function getAndEmbedLink(resource, embed, context) {
  var links;

  var embedded = resource._embedded[embed.rel];
  if (embedded) {
    // Related resource already embedded, so use it (it was added to the context in getResource)
    links = {href: embedded._links.self.href};
  } else {
    links = resource._links[embed.rel];
  }

  if (!links) {
    // Link relation does not exist, skip
    return;
  }

  var linkedResourcesPromise;
  if (Array.isArray(links)) {
    linkedResourcesPromise = Promise.all(links.map(function (link) {
      return getResource(link.href, embed.children, context);
    }));
  } else {
    linkedResourcesPromise = getResource(links.href, embed.children, context);
  }
  return linkedResourcesPromise.then(function (linkedResources) {
    resource._embedded[embed.rel] = linkedResources;
    return resource;
  });
}


/**
 * Convert a HAL object to its resource state, i.e. return a copy with '_links' and '_embedded' removed.
 *
 * @param {Hal} resource - The HAL resource.
 * @returns {Object} The resource state.
 */
function toState(resource) {
  var data = {};
  Object.keys(resource).forEach(function (key) {
    if (key !== '_links' && key !== '_embedded') {
      data[key] = resource[key];
    }
  })
  return data;
}


/**
 * Request the embedding of a link relation.
 *
 * @param {string} rel - The link relation.
 * @param {EmbedRequest|EmbedRequest[]} [children] - Embedding requests for the related resource(s).
 * @return EmbedRequest
 */
function embed(rel, children) {
  if (!children) {
    children = [];
  } else if (!Array.isArray(children)) {
    children = [children];
  }
  return {rel: rel, children: children};
}


/**
 * Perform an HTTP GET request for a HAL resource and ensure certain linked resources are embedded.
 *
 * @param {string} uri - The URI of the resource to get.
 * @param {EmbedRequest|EmbedRequest[]} [embeds] - Embed request(s) for linked resources.
 *
 * @returns {Promise<Hal>} A promise that resolves to the resource after all resources are embedded.
 */
function getHal(uri, embeds) {
  if (!embeds) {
    embeds = [];
  } else if (!Array.isArray(embeds)) {
    embeds = [embeds];
  }
  return getResource(uri, embeds, {});
}


/**
 * Perform an HTTP PUT request of a resource's state.
 *
 * @param {Hal} resource - The HAL resource.
 *
 * @returns {Promise<Response>} A promise that resolves to the HTTP response object
 *
 * @see toState
 */
function putState(resource) {
  return fetch(resource._links.self.href, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: toState(resource)
  });
}


module.exports = {
  embed: embed,
  getHal: getHal,
  linkHref: linkHref,
  putState: putState,
  toState: toState
}
