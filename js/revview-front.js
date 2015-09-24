/**
 * Revview Interface
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
	 * Backbone Model for the tooltips with information about revision.
	 */
	revview.RevisionInfoModel = Backbone.Model.extend({
		defaults: {
			author_name: '',
			date: ''
		}
	});

	/**
	 * Backbone View for the tooltips with information about revision.
	 */
	revview.RevisionInfoView = Backbone.View.extend({
		className: 'revview-info',

		template: wp.template( 'revview-info' ),

		initialize: function() {
			this.listenTo( this.model, 'change', this.render );
		},

		render: function(){
			this.$el.empty();
			this.$el.append( this.template( this.model.toJSON() ) );
			return this;
		}
	});

	/**
	 * Backbone View for the tooltips with information about revision.
	 */
	revview.RevisionTooltipView = revview.RevisionInfoView.extend({
		className: 'revview-tooltip',

		template: wp.template( 'revview-tooltip' )
	});

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
	revview.RevisionSelectorView = Backbone.View.extend( {
		events: {
			'mousemove' : 'mouseMove',
			'mouseleave' : 'mouseLeave'
		},

		initialize: function() {
			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave' );
		},

		render: function() {
			this.model.set( 'max', this.model.get( 'revisions' ).length - 1 );

			this.selectorRevisions = this.model.get( 'revisions' ).invoke( 'pick', [ 'author_name', 'date' ] );
			_.map( this.selectorRevisions, function( selectorRevision ) {
				selectorRevision.date = revviewDate( revview.datetime_format, selectorRevision.date );
			});

			this.$el.slider( _.extend( this.model.toJSON(), {
				stop: this.stop
			}) );

			var max = this.model.get( 'max' ),
				spacing = 100 / max;

			for ( var i = 0; i <= max; i++ ) {
				$( '<span class="revview-tick"></span>' ).css( 'left', ( spacing * i ) +  '%' ).appendTo( this.$el );
			}

			this.refreshTooltip(0);

			return this;
		},

		selectRevision: function( index ) {
			this.model.set( 'currentRevision', index );
		},

		stop: function( e, where ) {
			this.selectRevision( where.value );
		},

		mouseMove: function( e ) {
			var revisionsLength   = this.model.get( 'revisions' ).length,
				zoneCount         = revisionsLength - 1, // One fewer zone than models
				sliderFrom        = this.offset( this.$el ), // "From" edge of slider
				sliderWidth       = this.$el.width(), // Width of slider
				tickWidth         = sliderWidth / zoneCount, // Calculated width of zone
				actualX           = e.pageX - sliderFrom, // Flipped for RTL - sliderFrom;
				currentModelIndex = Math.floor( ( actualX  + ( tickWidth / 2 )  ) / tickWidth ); // Calculate the model index

			// Ensure sane value for currentModelIndex.
			if ( currentModelIndex < 0 ) {
				currentModelIndex = 0;
			} else if ( currentModelIndex >= revisionsLength ) {
				currentModelIndex = revisionsLength - 1;
			}

			// Refresh tooltip with new info
			this.refreshTooltip( currentModelIndex );
		},

		offset: function( $obj ) {
			var offset = $obj.offset() || {top: 0, left: 0}, win = $(window);
			return win.width()  - offset.left - $obj.outerWidth();
		},

		mouseLeave: function() {
			// Restore tooltip
			//this.refreshTooltip( this.model.get( 'currentRevision' ) );
		},

		refreshTooltip: function( index ) {
			RevisionTooltip.set( this.selectorRevisions[index] );
		}

	} );

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
			id: 'revview',

			current: {},

			revisionItem: {},

			initialize: function() {
				var self = this;

				self.current = {
					$title: $('.revview-title').eq(0).parent(),
					$content: $('.revview-content').eq(0).parent(),
					$excerpt: $('.revview-excerpt').eq(0).parent()
				};

				// Revision selector
				self.revisionItem = new revview.RevisionSelectorView({
					model: RevisionSelector
				});

				// Revision tooltip
				self.revisionItemTooltip = new revview.RevisionTooltipView({
					model: RevisionTooltip
				});

				// Revision tooltip
				self.revisionItemInfo = new revview.RevisionInfoView({
					model: RevisionInfo
				});

				self.listenTo( self.revisionItem.model, 'change:currentRevision', self.placeRevision );

				self.showLoading();
				RevisionList.fetch( {
					success: function( collection ) {
						console.log( 'Revision collection', collection );
						if ( collection.length > 0 ) {
							self.hideLoading();

							self.revisionItem.model.set( 'revisions', collection );

							// Add to page
							$( 'body' ).append( $( self.render().el ).wrapInner('<div class="revview-revision-list" />').fadeIn() );
						}
					}
				} );
			},

			render: function () {
				this.$el.append( this.revisionItemTooltip.render().el );
				this.$el.append( this.revisionItem.render().el );
				this.$el.append( this.revisionItemInfo.render().el );
				this.refreshInfo(0);
				return this;
			},

			placeRevision: function() {
				var self = this,
					currentRevision = self.revisionItem.model.get( 'currentRevision' );

				self.showLoading();
				RevisionList.getRevision( currentRevision, function ( foundRevision ) {
					self.hideLoading();
					console.log( 'Revision found', foundRevision );
					self.refreshInfo( currentRevision );
				} );
			},

			refreshInfo: function( index ) {
				RevisionInfo.set( this.revisionItem.selectorRevisions[index] );
			}

		}, ViewMixins )
	);

	// Load all revision IDs
	var RevisionList = new revview.RevisionList,
		RevisionSelector = new revview.RevisionSelectorModel,
		RevisionTooltip = new revview.RevisionInfoModel,
		RevisionInfo = new revview.RevisionInfoModel,
		RevisionInterface;

	$(document).ready(function(){

		RevisionInterface = new revview.RevisionInterface({
			model: new revview.RevisionInterfaceModel
		});

	});

})( jQuery );