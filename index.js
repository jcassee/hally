'use strict';

var uriTemplates = require('uri-templates');


/**
 * Module for performing HTTP GET en PUT requests for HAL resources.
 *
 * Its main use is to embed linked resources, even when the server returns only the links.
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
 * @returns {string|string[]|null} the target URI(s)
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

  return null;
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
 * The embed request key is a relation type that should be embedded, the
 * (optional) value the embed request(s) for the embedded resources.
 *
 * @typedef {Object.<string, EmbedRequest|null>} EmbedRequest
 */


/**
 * Fetch a HAL resource.
 *
 * @param {string} uri - The resource URI.
 * @param {Object} opts - A fetch options object to be used with any GET request for linked resources.
 * @param {EmbedRequest[]} embeds  - Embed requests for the resource.
 * @param {Context}        context - The resource context to store resources in.
 *
 * @returns {Promise<Hal>} A promise that resolves to the HAL resource.
 */
function fetchHalJson(uri, opts, embeds, context) {
  var promise;
  if (uri in context) {
    promise = Promise.resolve(context[uri]);
  } else {
    promise = fetch(uri, opts)
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
    return fetchAndEmbedLinks(resource, opts, embeds, context);
  });
}

/**
 * For all embed requests, get the linked resources and embed them.
 *
 * @param {Hal} resource - The HAL resource to process.
 * @param {Object} opts - A fetch options object to be used with any GET request for linked resources.
 * @param {EmbedRequest|null} embeds - The embed requests.
 * @param {Context} context - The resources context. Makes sure each resource is requested only once.
 *
 * @return {Promise<Hal>} A promise that resolve to the resource after all resources are embedded.
 */
function fetchAndEmbedLinks(resource, opts, embeds, context) {
  if (!embeds) embeds = {};
  var embedPromises = Object.keys(embeds).map(function (rel) {
    return fetchAndEmbedLink(resource, opts, rel, embeds[rel], context);
  })
  // var embedPromises = embeds.map(function (embed) {
  //   return fetchAndEmbedLink(resource, opts, embed, context);
  // })
  return Promise.all(embedPromises)
      .then(function (/* ignore embedding result */) {
        return resource;
      });
}

/**
 * Get linked resources and embed them.
 *
 * @param {Hal} resource - The HAL resource to process.
 * @param {Object} opts - A fetch options object to be used with any GET request for linked resources.
 * @param {string} rel - The link relation to embed.
 * @param {EmbedRequest|null} embeds - Embed request for the related resource.
 * @param {Context} context - The resources context. Makes sure each resource is requested only once.
 *
 * @return {Promise<Hal>} A promise that resolve to the resource after all resources are embedded.
 */
function fetchAndEmbedLink(resource, opts, rel, embeds, context) {
  var hrefs = linkHref(resource, rel);
  if (!hrefs) {
    // Link relation does not exist, skip
    return;
  }

  var linkedResourcesPromise;
  if (Array.isArray(hrefs)) {
    linkedResourcesPromise = Promise.all(hrefs.map(function (href) {
      return fetchHalJson(href, opts, embeds, context);
    }));
  } else {
    linkedResourcesPromise = fetchHalJson(hrefs, opts, embeds, context);
  }
  return linkedResourcesPromise.then(function (linkedResources) {
    resource._embedded[rel] = linkedResources;
    return resource;
  });
}


/**
 * Convert a HAL resource to its resource state, i.e. return a copy with '_links' and '_embedded' removed.
 *
 * @param {Hal} resource - The HAL resource.
 *
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
 * Convert a HAL resource to a fetch body, i.e. the stringified JSON with '_links' and '_embedded' removed.
 *
 * @param {Hal} resource - The HAL resource.
 *
 * @returns {string} The fetch body.
 */
function stateBody(resource) {
  return JSON.stringify(toState(resource));
}


/**
 * Perform an HTTP GET request for a HAL resource and ensure certain linked resources are embedded.
 *
 * @param {Object} opts - A fetch options object to be used with any GET request for linked resources.
 * @param {EmbedRequest} [embeds] - Embed request(s) for linked resources. If absent, 'opts.embeds' is used.
 *
 * @returns {Promise<Hal>} A promise that resolves to the resource after all resources are embedded.
 */
function halJson(opts, embeds) {
  if (!embeds) embeds = opts.embeds;
  return function (response) {
    return response.json().then(function (resource) {
      var context = {};
      addToContext(context, resource);
      return fetchAndEmbedLinks(resource, opts, embeds, context);
    })
  }
}


module.exports = {
  halJson: halJson,
  linkHref: linkHref,
  stateBody: stateBody,
  toState: toState
}
