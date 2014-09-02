var _ = require('underscore');
var extend = require('extend-object');
var PouchDB = require('pouchdb');

var methodMap = {
  'create': 'post',
  'update': 'put',
  'patch':  'put',
  'delete': 'remove'
};

// Throw an error when a DB is needed, and none is supplied.
var dbError = function () {
  throw new Error('A \'db\' property or function must be specified');
};

var pouchSettings = {
  defaults: {
    database: null,
    fetch: 'allDocs',
    listen: false,
    options: {
      post: {},
      put: {},
      get: {},
      remove: {},
      allDocs: {},
      query: {},
      spatial: {},
      changes: {
        continuous: true
      }
    }
  }
};

module.exports = function (defaults) {

  defaults = defaults || {};
  pouchSettings.defaults.db = new PouchDB(defaults.database);
  defaults = extend(pouchSettings.defaults, defaults);

  var adapter = function (method, model, options) {

    options = options || {};
    options = extend(defaults, model && model.pouch || {}, options);

    // This is to get the options (especially options.db)
    // by calling model.sync() without arguments.
    if (typeof method !== 'string') {
      return options;
    }

    // ensure we have a pouchdb adapter
    if (!options.db) {
      dbError();
    }

    function callback (err, response) {

      if (err) {
        return options.error && options.error(err);
      }

      if (method === 'create' || method === 'update' || method === 'patch') {
        response = {
          _id: response.id,
          _rev: response.rev
        };
      }

      if (method === 'delete') {
        response = {};
      }

      if (method === 'read') {

        if (options.listen) {
          options.db.info(function (err, info) {
            // get changes since info.update_seq
            options.db.changes(_.extend({}, options.options.changes, {
              since: info.update_seq,
              onChange: function (change) {
                var todo = model.get(change.id);

                if (change.deleted) {
                  if (todo) {
                    todo.destroy();
                  }
                } else {
                  if (todo) {
                    todo.set(change.doc);
                  } else {
                    model.add(change.doc);
                  }
                }

                // call original onChange if present
                if (_.isFunction(options.options.changes.onChange)) {
                  options.options.changes.onChange(change);
                }
              }
            }));

          });
        }
      }
      return options.success && options.success(response);
    }

    model.trigger('request', model, options.db, options);

    if (method === 'read') {
      // get single model
      if (model.id) {
        return options.db.get(model.id, options.options.get, callback);
      }
      // query view or spatial index
      if (options.fetch === 'query' || options.fetch === 'spatial') {
        if (!options.options[options.fetch].fun) {
          throw new Error('A \'' + options.fetch + '.fun\' object must be specified');
        }
        return options.db[options.fetch](options.options[options.fetch].fun, options.options[options.fetch], callback);
      }
      // allDocs or spatial query
      options.db[options.fetch](options.options[options.fetch], callback);
    } else {
      options.db[methodMap[method]](model.toJSON(), options.options[methodMap[method]], callback);
    }

    return options;
  };

  adapter.defaults = defaults;

  return adapter;

};

