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
						console.log( 'New revision loaded model', model );

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
	 * Backbone View for interface to select revisions.
	 */
	revview.RevisionInterface = Backbone.View.extend( _.extend(
		{
			tagName: 'ul',

			className: 'revview-revision-list',

			current: {},

			initialize: function() {
				var self = this;

				self.current = {
					$title: $('.revview-title').eq(0).parent(),
					$content: $('.revview-content').eq(0).parent(),
					$excerpt: $('.revview-excerpt').eq(0).parent()
				};

				self.showLoading();
				RevisionList.fetch( {
					success: function( collection ) {
						console.log( 'Revision collection', collection );
						if ( collection.length > 0 ) {
							self.hideLoading();
							// Add revision selectors
							$( '.revview-content' ).append( $( self.render().el ).fadeIn() );
						}
					}
				} );
			},

			render: function () {
				RevisionList.each( function ( revision ) {
					var revisionListItem = new revview.RevisionSelectorItemView( { model: revision } );
					this.$el.append( revisionListItem.el );
				}, this );
				return this;
			}
		}, ViewMixins )
	);

	/**
	 * Backbone View for single revision selector.
	 */
	revview.RevisionSelectorItemView = Backbone.View.extend( _.extend(
		{
			tagName: 'li',

			template: wp.template( 'revview-list-item' ),

			index: 0,

			events: {
				'click .revview-revision-item' : 'placeRevision'
			},

			initialize: function(){
				this.index = this.model.collection.indexOf( this.model );
				console.log( this.index );
				this.render();
			},

			render: function(){
				this.$el.append( this.template( this.model.toJSON() ) );
			},

			placeRevision: function() {
				var self = this;
				self.showLoading();
				RevisionList.getRevision( this.index, function( foundRevision ) {
					self.hideLoading();
					console.log( 'Revision found', foundRevision );
				} );
			}
		}, ViewMixins )
	);

	// Load all revision IDs
	var RevisionList = new revview.RevisionList;

	$(document).ready(function(){

		var RevisionInterface = new revview.RevisionInterface;

	});

})( jQuery );