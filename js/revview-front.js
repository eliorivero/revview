/**
 * Revview - Interface
 */

var WP_API_Settings, wp, TimeStampedMixin, HierarchicalMixin, revview;

(function ( $ ) {

	'use strict';

	/**
	 * Backbone model for public revisions
	 */
	revview.RevisionModel = wp.api.models.Revision.extend( _.extend(
		/** @lends Revision.prototype */
		{
			/**
			 * Return URL for the model
			 *
			 * @returns {string}
			 */
			url: function() {
				var id = this.get( 'id' ) || '';
				return WP_API_Settings.root + 'revview/v1/posts/' + revview.post_id + '/revisions/' + id;
			},

			defaults: _.extend( {},
				wp.api.models.Revision.prototype.defaults,
				{
					author_name: '',
					loaded: false
				}
			)

		}, TimeStampedMixin, HierarchicalMixin )
	);

	/**
	 * Backbone public revisions collection
	 */
	revview.RevisionList = wp.api.collections.Revisions.extend(
		/** @lends Revisions.prototype */
		{
			model: revview.RevisionModel,

			/**
			 * return URL for collection
			 *
			 * @returns {string}
			 */
			url: function() {
				var id = this.get( 'id' ) || revview.post_id;
				return WP_API_Settings.root + 'revview/v1/posts/' + id + '/revisions/ids';
			},

			/**
			 * Looks for a revision in the collection first by index.
			 * @param index
			 * @param whenFound
			 */
			getRevision: function( index, whenFound ) {
				var self = this,
					found = self.at( index );

				if ( _.isObject( found ) && found.get( 'loaded' ) ) {
					console.log( 'Returning already loaded model', found );
					whenFound( found );
					return;
				}

				var newRevision = new revview.RevisionModel( {
					id: self.at( index ).get( 'id' )
				});

				newRevision.fetch({
					success: function( model ) {
						self.remove( self.at( index ) );
						model.set( 'loaded', true );
						self.add( model, { at: index, merge: true } );

						found = self.at( index );

						console.log( 'Returning loaded model after insertion', found );

						if ( _.isObject( found ) && found.get( 'loaded' ) ) {
							whenFound( found );
						}
					},
					error: function() {
						whenFound( found );
					}
				});
			}
		}
	);

	/**
	 * Mixin with common utilities for views.
	 * @type {{showLoading: Function, hideLoading: Function}}
	 */
	var ViewMixins = {

		showLoading: function() {
			console.log( 'loading...' );
		},

		hideLoading: function() {
			console.log( 'loaded' );
		}
	};

	/**
	 * Backbone Model for revision selector bar.
	 */
	revview.RevisionSelectorModel = Backbone.Model.extend({
		defaults: {
			value: null,
			values: null,
			min: 0,
			max: 1,
			step: 1,
			range: false,
			currentRevision: 0
		},

		initialize: function() {
			// Listen for internal changes
			this.on( 'change:currentRevision', this.update );
		},

		update: function() {
			console.log( this.get( 'currentRevision' ) );
		}

	});

	/**
	 * Backbone View for single revision selector.
	 */
	revview.RevisionSelectorView = Backbone.View.extend( _.extend(
		{
			initialize: function(){
				_.bindAll( this, 'stop' );
			},

			render: function(){
				this.model.set( 'max', this.model.get( 'revisions' ).length - 1 );

				this.$el.slider( _.extend( this.model.toJSON(), {
					start: this.start,
					slide: this.slide,
					stop:  this.stop
				}) );

				// Add revision selectors
				var selectors = this.model.get( 'revisions' ).invoke( 'pick', [ 'id', 'author_name', 'date' ] );
				console.log( selectors );

				return this;
			},

			selectRevision: function( index ) {
				this.model.set( 'currentRevision', index );
				this.trigger( 'change:currentRevision' );
			},

			stop: function( e, where ) {
				this.selectRevision( where.value );
			}

		}, ViewMixins )
	);

	revview.RevisionInterfaceModel = Backbone.Model.extend({
		defaults: {
			currentRevisionIndex: 0
		}
	});

	/**
	 * Backbone View for interface to select revisions.
	 */
	revview.RevisionInterface = Backbone.View.extend( _.extend(
		{
			className: 'revview-revision-list',

			current: {},

			revisionItem: {},

			initialize: function() {
				var self = this;

				self.current = {
					$title: $('.revview-title').eq(0).parent(),
					$content: $('.revview-content').eq(0).parent(),
					$excerpt: $('.revview-excerpt').eq(0).parent()
				};

				self.revisionSelector = new revview.RevisionSelectorModel;

				self.revisionItem = new revview.RevisionSelectorView({
					model: self.revisionSelector
				});

				self.showLoading();
				RevisionList.fetch( {
					success: function( collection ) {
						console.log( 'Revision collection', collection );
						if ( collection.length > 0 ) {
							self.hideLoading();
							self.model.set( 'revisions', collection );
							self.revisionItem.model.set( 'revisions', collection );
							self.listenTo( self.revisionSelector, 'change:currentRevision', self.placeRevision );
							$( '.revview-content' ).append( $( self.render().el ).fadeIn() );
						}
					}
				} );
			},

			render: function () {
				this.$el.append( this.revisionItem.render().el );
				return this;
			},

			placeRevision: function() {
				var self = this,
					currentRevision = self.revisionSelector.get( 'currentRevision' );

				self.showLoading();
				RevisionList.getRevision( currentRevision, function ( foundRevision ) {
					self.hideLoading();
					console.log( 'Revision found', foundRevision );
				} );
			}
		}, ViewMixins )
	);
	// Load all revision IDs
	var RevisionList = new revview.RevisionList;

	$(document).ready(function(){

		var RevisionInterface = new revview.RevisionInterface({
			model: new revview.RevisionInterfaceModel
		});

	});

})( jQuery );