'use strict';

var fetchMock = require('fetch-mock');

var hally = require('./index');


beforeEach(function() {
  fetchMock.catch(function (url, opts) {
    expect(true).toBe(false);
  })
});

afterEach(function () {
  expect(fetchMock.done()).toBe(true);
  fetchMock.restore();
})


describe('linkHref', function() {
  var linkHref = hally.linkHref;

  var resource = {
    _links: {
      self: {href: 'http://example.com'},
      rel1: {href: 'http://example.com/linked1'},
      rel2: [{href: 'http://example.com/linked2a'}, {href: 'http://example.com/linked2b'}],
      tpl1: {href: 'http://example.com/templated1/{foo}'},
      tpl2: [{href: 'http://example.com/templated2a/{foo}'}, {href: 'http://example.com/templated2b/{foo}'}],
      both: {href: 'http://example.com/both/linked'}
    },
    _embedded: {
      emb1: {_links: {self: {href: 'http://example.com/embedded1'}}, _embedded: {}},
      emb2: [{_links: {self: {href: 'http://example.com/embedded2a'}}, _embedded: {}},
        {_links: {self: {href: 'http://example.com/embedded2b'}}, _embedded: {}}],
      both: {_links: {self: {href: 'http://example.com/both/embedded'}}, _embedded: {}}
    }
  };

  it('returns the href of a link', function() {
    expect(linkHref(resource, 'rel1')).toEqual('http://example.com/linked1');
  });

  it('returns the href of a link array', function() {
    expect(linkHref(resource, 'rel2')).toEqual(['http://example.com/linked2a', 'http://example.com/linked2b']);
  });

  it('returns the href of a templated link', function() {
    expect(linkHref(resource, 'tpl1', {foo: 'bar'})).toEqual('http://example.com/templated1/bar');
  });

  it('returns the href of a templated link array', function() {
    expect(linkHref(resource, 'tpl2', {foo: 'bar'}))
        .toEqual(['http://example.com/templated2a/bar', 'http://example.com/templated2b/bar']);
  });

  it('returns the href of an embedded resource', function() {
    expect(linkHref(resource, 'emb1')).toEqual('http://example.com/embedded1');
  });

  it('returns the href of an embedded resource array', function() {
    expect(linkHref(resource, 'emb2'))
        .toEqual(['http://example.com/embedded2a', 'http://example.com/embedded2b']);
  });

  it('returns the href of a linked resources even when an embedded resource exists', function() {
    expect(linkHref(resource, 'both')).toEqual('http://example.com/both/linked');
  });

  it('returns undefined if a link does not exist', function() {
    expect(linkHref(resource, 'nonexistent')).toBeUndefined();
  });

});


describe('toState', function() {
  var toState = hally.toState;

  it('removes the _links and _embedded properties', function() {
    var resource = {
      property: 'value',
      _links: {
        self: {href: 'http://example.com'}
      },
      _embedded: {
        other: {
          _links: {
            self: {href: 'http://example.com/other'}
          },
          _embedded: {}
        }
      }
    };

    var state = toState(resource)
    expect(state).toEqual({property: 'value'});
  });

});


describe('getHal', function() {
  var getHal = hally.getHal;
  var embed = hally.embed;

  it('gets a resource', function () {
    var resource = {
      property: 'value',
      _links: {
        self: {href: 'http://example.com'}
      },
      _embedded: {}
    };

    fetchMock.get('*', resource);

    return getHal('http://example.com').then(function (res) {
      // Verify request
      expect(fetchMock.calls('*')).toEqual([[
        'http://example.com',
        {
          headers: {
            'Accept': 'application/hal+json'
          }
        }
      ]]);

      // Verify response
      expect(res).toEqual(resource);
    });
  });

  it('creates an empty _embedded property if it does not exist', function () {
    var resource = {
      _links: {
        self: {href: 'http://example.com'}
      }
    };

    fetchMock.get('*', resource);

    return getHal('http://example.com').then(function (res) {
      expect(res._embedded).toEqual({});
    });
  });

  it('embeds a linked resource', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other'}
        }
      },
      'http://example.com/other': {
        property: 'value',
        _links: {
          self: {href: 'http://example.com/other'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', embed('other')).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other'}
        },
        _embedded: {
          other: {
            property: 'value',
            _links: {
              self: {href: 'http://example.com/other'}
            },
            _embedded: {}
          }
        }
      });
    });
  });

  it('ignores nonexistent link relations', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', embed('other')).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'}
        },
        _embedded: {}
      });
    });
  });

  it('embeds multiple linked resources', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          other1: {href: 'http://example.com/other1'},
          other2: {href: 'http://example.com/other2'}
        }
      },
      'http://example.com/other1': {
        _links: {
          self: {href: 'http://example.com/other1'}
        }
      },
      'http://example.com/other2': {
        _links: {
          self: {href: 'http://example.com/other2'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', [embed('other1'), embed('other2')]).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'},
          other1: {href: 'http://example.com/other1'},
          other2: {href: 'http://example.com/other2'}
        },
        _embedded: {
          other1: {
            _links: {
              self: {href: 'http://example.com/other1'}
            },
            _embedded: {}
          },
          other2: {
            _links: {
              self: {href: 'http://example.com/other2'}
            },
            _embedded: {}
          }
        }
      });
    });
  });

  it('embeds an array of linked resource', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          other: [{href: 'http://example.com/other1'}, {href: 'http://example.com/other2'}]
        }
      },
      'http://example.com/other1': {
        _links: {
          self: {href: 'http://example.com/other1'}
        }
      },
      'http://example.com/other2': {
        _links: {
          self: {href: 'http://example.com/other2'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', embed('other')).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'},
          other: [{href: 'http://example.com/other1'}, {href: 'http://example.com/other2'}]
        },
        _embedded: {
          other: [{
            _links: {
              self: {href: 'http://example.com/other1'}
            },
            _embedded: {}
          }, {
            _links: {
              self: {href: 'http://example.com/other2'}
            },
            _embedded: {}
          }]
        }
      });
    });
  });

  it('embeds nested resources', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other1'}
        }
      },
      'http://example.com/other1': {
        _links: {
          self: {href: 'http://example.com/other1'},
          next: {href: 'http://example.com/other2'}
        }
      },
      'http://example.com/other2': {
        _links: {
          self: {href: 'http://example.com/other2'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', embed('other', embed('next'))).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other1'}
        },
        _embedded: {
          other: {
            _links: {
              self: {href: 'http://example.com/other1'},
              next: {href: 'http://example.com/other2'}
            },
            _embedded: {
              next: {
                _links: {
                  self: {href: 'http://example.com/other2'}
                },
                _embedded: {}
              }
            }
          }
        }
      });
    });
  });

  it('embeds nested resources in embedded resources', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other1'}
        },
        _embedded: {
          other: {
            _links: {
              self: {href: 'http://example.com/other1'},
              next1: {href: 'http://example.com/other2'}
            }
          },
          more: [{
            _links: {
              self: {href: 'http://example.com/more1'}
            }
          }, {
            _links: {
              self: {href: 'http://example.com/more2'}
            }
          }]
        }
      },
      'http://example.com/other2': {
        _links: {
          self: {href: 'http://example.com/other2'}
        }
      },
      'http://example.com/other3': {
        _links: {
          self: {href: 'http://example.com/other3'}
        }
      }
    };

    fetchMock.get('*', function (url, opts) {
      return resources[url];
    })

    return getHal('http://example.com', embed('other', [embed('next1'), embed('next2')])).then(function (res) {
      expect(res).toEqual({
        _links: {
          self: {href: 'http://example.com'},
          other: {href: 'http://example.com/other1'}
        },
        _embedded: {
          other: {
            _links: {
              self: {href: 'http://example.com/other1'},
              next1: {href: 'http://example.com/other2'}
            },
            _embedded: {
              next1: {
                _links: {
                  self: {href: 'http://example.com/other2'}
                },
                _embedded: {}
              }
            }
          },
          more: [{
            _links: {
              self: {href: 'http://example.com/more1'}
            },
            _embedded: {}
          }, {
            _links: {
              self: {href: 'http://example.com/more2'}
            },
            _embedded: {}
          }]
        }
      });
    });
  });

  it('handles circular relations', function () {
    var resource = {
      _links: {
        self: {href: 'http://example.com'},
        rel: {href: 'http://example.com'},
      }
    };

    fetchMock.get('*', resource);

    return getHal('http://example.com', embed('rel')).then(function (res) {
      expect(res).toHaveProperty('_embedded.rel._links.self.href',
          'http://example.com');
      expect(res).toHaveProperty('_embedded.rel._embedded.rel._links.self.href',
          'http://example.com');
    });
  });

  it('requests resources only once', function () {
    var resources = {
      'http://example.com': {
        _links: {
          self: {href: 'http://example.com'},
          rel1: {href: 'http://example.com/other'},
          rel2: {href: 'http://example.com/other'}
        }
      },
      'http://example.com/other': {
        _links: {
          self: {href: 'http://example.com/other'},
          rel: {href: 'http://example.com'}
        }
      }
    };

    var seenUrls = new Set();
    fetchMock.get('*', function (url, opts) {
      expect(seenUrls.has(url)).toBe(false);
      seenUrls.add(url);
      return resources[url];
    })

    return getHal('http://example.com', [embed('rel1', embed('rel')), embed('rel2')]).then(function (res) {
      expect(res).toHaveProperty('_embedded.rel1._links.self.href',
          'http://example.com/other');
      expect(res).toHaveProperty('_embedded.rel1._embedded.rel._links.self.href',
          'http://example.com');
      expect(res).toHaveProperty('_embedded.rel1._embedded.rel._embedded.rel2._links.self.href',
          'http://example.com/other');
    });
  });

  it('does not request resources that were already embedded', function () {
    var resource = {
      _links: {
        self: {href: 'http://example.com'},
        rel1: {href: 'http://example.com/other'},
        rel2: [{href: 'http://example.com/other'}, {href: 'http://example.com/other'}]
      },
      _embedded: {
        rel1: {
          _links: {
            self: {href: 'http://example.com/other'},
            rel3: {href: 'http://example.com/other'}
          }
        }
      }
    };

    fetchMock.get('*', resource);

    return getHal('http://example.com', [embed('rel1', embed('rel3')), embed('rel2')]).then(function (res) {
      // Verify request
      expect(fetchMock.calls('*')).toEqual([[
        'http://example.com',
        {
          headers: {
            'Accept': 'application/hal+json'
          }
        }
      ]]);

      // Verfy response
      expect(res).toHaveProperty('_embedded.rel1._links.self.href', 'http://example.com/other');
      var rel2 = res._embedded.rel2;
      expect(rel2[0]).toHaveProperty('_links.self.href', 'http://example.com/other');
      expect(rel2[0]).toHaveProperty('_embedded.rel3._links.self.href', 'http://example.com/other');
    });
  });
});



describe('putState', function() {
  var putState = hally.putState;

  it('puts the resource state (without _links and _embedded)', function () {
    var resource = {
      property: 'value',
      _links: {
        self: {href: 'http://example.com'}
      },
      _embedded: {
        other: {
          property: 'othervalue',
          _links: {
            self: {href: 'http://example.com/other'}
          }
        }
      }
    };

    fetchMock.put('*', 204);

    return putState(resource).then(function (response) {
      // Verify the request
      expect(fetchMock.calls('*')).toEqual([[
        'http://example.com',
        {
          body: {
            property: 'value'
          },
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'PUT'
        }
      ]]);

      // Verify the response
      expect(response.status).toBe(204);
    });
  });
});
