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
			 * Set nonce header before every Backbone sync
			 *
			 * @param {string} method
			 * @param {Backbone.Model} model
			 * @param {{beforeSend}, *} options
			 * @returns {*}
			 */
			sync: function( method, model, options ) {
				options = options || {};

				if ( 'undefined' !== typeof WP_API_Settings.nonce ) {
					var beforeSend = options.beforeSend;

					options.beforeSend = function( xhr ) {
						xhr.setRequestHeader( 'X-WP-Nonce', WP_API_Settings.nonce );
						xhr.setRequestHeader( 'X-WP-Revview-Styles', revview.styles );
						xhr.setRequestHeader( 'X-WP-Revview-Scripts', revview.scripts );
						xhr.setRequestHeader( 'X-WP-Revview-JS-Templates', revview.js_templates );

						if ( beforeSend ) {
							return beforeSend.apply( this, arguments );
						}
					};
				}

				return Backbone.sync( method, model, options );
			},

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
			 */
			getRevision: function( index ) {
				var self = this,
					found = self.at( index );

				if ( _.isObject( found ) && found.get( 'loaded' ) ) {
					self.trigger( 'change', found );
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

						self.trigger( 'change', model );
					}
				});
			}
		}
	);

	/**
	 * Backbone Model for the information about currently displayed revision.
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
	 * Backbone Model for the tooltips with information about revision.
	 */
	revview.RevisionTooltipModel = Backbone.Model.extend({
		defaults: {
			display: {
				author_name: '',
				date: ''
			},
			mouseX: 0,
			visible: false
		}
	});

	/**
	 * Backbone View for the tooltips with information about revision.
	 */
	revview.RevisionTooltipView = revview.RevisionInfoView.extend({
		className: 'revview-tooltip',

		template: wp.template( 'revview-tooltip' ),

		initialize: function() {
			this.listenTo( this.model, 'change:display', this.render );
			this.listenTo( this.model, 'change:mouseX', this.updatePosition );
			this.listenTo( this.model, 'change:visible', this.updateVisibility );
			this.$el.hide();
		},

		updatePosition: function() {
			this.$el.css( 'left', this.model.get( 'mouseX' ) + 'px' );
		},

		updateVisibility: function() {
			if ( this.model.get( 'visible' ) ) {
				this.$el.show();
			} else {
				this.$el.hide();
			}
		}
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
		}
	});

	/**
	 * Backbone View for single revision selector.
	 */
	revview.RevisionSelectorView = Backbone.View.extend( {
		events: {
			'mousemove' : 'mouseMove',
			'mouseleave' : 'mouseLeave',
			'mouseenter' : 'mouseEnter'
		},

		currentRevisionIndex: 0,

		initialize: function( args ) {
			this.tooltip = args.tooltip;
			this.app = args.app;

			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave', 'mouseEnter' );

			this.refreshTooltip = _.throttle( this.refreshTooltip, 300 );
		},

		/**
		 * For all revision models, format the date & time according to date & time specified in WP Admin > Settings.
		 * Render revision selector bar adding tick marks.
		 *
		 * @returns {revview.RevisionSelectorView}
		 */
		render: function() {
			this.selectorRevisions = _.each( this.model.get( 'revisions' ).invoke( 'pick', [ 'author_name', 'date' ] ), function( revision ) {
				revision.date = revviewDate( revview.datetime_format, revision.date );
			});

			// Revision selection bar
			this.model.set( 'max', this.model.get( 'revisions' ).length - 1 );
			this.$el.slider( _.extend( this.model.toJSON(), {
				stop: this.stop
			}) );

			// Tick marks
			var max = this.model.get( 'max' ),
				spacing = 100 / max;
			for ( var i = 0; i <= max; i++ ) {
				$( '<span class="revview-tick"></span>' ).css( 'left', ( spacing * i ) +  '%' ).appendTo( this.$el );
			}

			return this;
		},

		/**
		 * Update revision reference and information to be displayed.
		 *
		 * @param { number } index
		 */
		selectRevision: function( index ) {
			this.app.model.set( 'currentRevision', index );
			this.app.model.set( 'currentInfo', this.selectorRevisions[index] );
		},

		/**
		 * User stopped dragging the slider handle or clicked on the selection bar.
		 *
		 * @param { object } e
		 * @param where
		 */
		stop: function( e, where ) {
			this.selectRevision( where.value );
		},

		mouseMove: function( e ) {
			var revisionsLength = this.model.get( 'revisions' ).length,
				zoneCount       = revisionsLength - 1, // One fewer zone than models
				sliderFrom      = this.offset( this.$el ), // "From" edge of slider
				sliderWidth     = this.$el.width(), // Width of slider
				tickWidth       = sliderWidth / zoneCount, // Calculated width of zone
				actualX         = e.pageX - sliderFrom; // Flipped for RTL - sliderFrom;

			this.currentRevisionIndex = Math.floor( ( actualX  + ( tickWidth / 2 )  ) / tickWidth ); // Calculate the model index

			// Ensure sane value for this.currentRevisionIndex.
			if ( this.currentRevisionIndex < 0 ) {
				this.currentRevisionIndex = 0;
			} else if ( this.currentRevisionIndex >= revisionsLength ) {
				this.currentRevisionIndex = revisionsLength - 1;
			}

			// Move tooltip
			this.tooltip.model.set( 'mouseX', actualX );

			// Refresh tooltip with new info
			this.refreshTooltip();
		},

		offset: function( $obj ) {
			var offset = $obj.offset() || {top: 0, left: 0}, win = $(window);
			return win.width()  - offset.left - $obj.outerWidth();
		},

		mouseEnter: function() {
			this.tooltip.model.set( 'visible', true );
		},

		mouseLeave: function() {
			this.tooltip.model.set( 'visible', false );
		},

		refreshTooltip: function() {
			this.tooltip.model.set( 'display', this.selectorRevisions[this.currentRevisionIndex] );
		}

	} );

	revview.RevisionAppModel = Backbone.Model.extend({
		defaults: {
			currentRevision: 0,
			currentInfo: {},
			initialized: false,
			lastRevision: 0
		}
	});

	/**
	 * Backbone View for interface to select revisions.
	 */
	revview.RevisionApp = Backbone.View.extend({
		id: 'revview',

		className: 'revview-off', // starts hidden

		current: {},
		original: {},

		template: wp.template( 'revview-app' ),

		events: {
			'click .revview-start': 'startRevisions',
			'click .revview-stop': 'stopRevisions'
		},

		initialize: function() {
			// Get title, content and excerpt in page and save them
			this.current = this.getAvailableElements();
			this.original = this.saveOriginalHTML();

			// Revision tooltip
			this.revisionTooltip = new revview.RevisionTooltipView({
				model: RevisionTooltip
			});

			// Current revision information
			this.revisionInfo = new revview.RevisionInfoView({
				model: RevisionInfo
			});

			// Revision selector
			this.revisionSelector = new revview.RevisionSelectorView({
				model: RevisionSelector,
				tooltip: this.revisionTooltip,
				app: this
			});

			this.listenTo( this.collection, 'request', this.showLoading );
			this.listenTo( this.collection, 'sync', this.hideLoading );
			this.listenTo( this.model, 'change:currentRevision', this.changeRevision );
			this.listenToOnce( this.collection, 'sync', this.firstSync );
			this.listenTo( this.collection, 'change', this.placeRevision );

			// Add revision UI to page
			$( 'body' ).append( this.render().$el );
		},

		/**
		 * Return available title, content and excerpt as jQuery objects.
		 *
		 * @returns { Object }
		 */
		getAvailableElements: function() {
			var elements = {};
			_.each( ['title', 'content', 'excerpt'], function ( element ) {
				var $element = $( '.revview-' + element ).eq( 0 ).parent();
				if ( $element.length > 0 ) {
					elements[element] = $element;
				}
			} );
			return elements;
		},

		/**
		 * Keep a copy of original HTML in title, content and excerpt to be restored.
		 *
		 * @returns { Object }
		 */
		saveOriginalHTML: function() {
			var elements = {};
			_.each( this.current, function( $element, key ) {
				elements[key] = $element.html();
			}, this );
			return elements;
		},

		/**
		 * Called by button to view revisions.
		 */
		startRevisions: function() {
			this.showUI();
			if ( this.model.get( 'initialized' ) ) {
				this.loadLastRevision( this.model.get( 'lastRevision' ) );
			} else {
				this.model.set( 'initialized', true );
				this.collection.fetch();
			}
		},

		/**
		 * Restores original title, content and excerpt.
		 */
		stopRevisions: function() {
			this.hideUI();
			this.model.set( 'lastRevision', this.model.get( 'currentRevision' ) );
			this.loadLastRevision( 0 );
		},

		/**
		 * Shows UI for revision selection. Hides start button, shows stop button.
		 */
		showUI: function() {
			this.$el.removeClass( 'revview-off' );
			this.$el.addClass( 'revview-on' );
		},

		/**
		 * Hides UI for revision selection. Hides stop button, shows start button.
		 */
		hideUI: function() {
			this.$el.removeClass( 'revview-on' );
			this.$el.addClass( 'revview-off' );
		},

		/**
		 * Initializes UI preparing revision selector list with author name and date, adds UI to page and loads the latest revision saved.
		 *
		 * @param { Object } collection
		 */
		firstSync: function( collection ) {
			if ( collection.length > 0 ) {
				// Load collection with only author name and date
				this.revisionSelector.model.set( 'revisions', collection );

				this.$el.prepend( $('<div class="revview-revision-list" />').append( [this.revisionTooltip.render().el, this.revisionSelector.render().el, this.revisionInfo.render().el] ) );

				// Same than current content
				this.loadLastRevision( 0 );
			}
		},

		loadLastRevision: function( index ) {
			this.model.set( 'currentRevision', index );
			this.model.set( 'currentInfo', this.revisionSelector.selectorRevisions[index] );
			this.model.trigger( 'change:currentRevision' );
		},

		/**
		 * Fired when the revision index changes. Will fetch the selected revision if the full data is not in collection.
		 */
		changeRevision: function() {
			this.showLoading();
			this.collection.getRevision( this.model.get( 'currentRevision' ) );
		},

		/**
		 * Render revision selector.
		 *
		 * @returns {revview.RevisionApp}
		 */
		render: function() {
			this.$el.append( this.template() );
			return this;
		},

		/**
		 * Replace current title, content and excerpt with those in selected revision.
		 * Updates displayed revision information.
		 *
		 * @param { Object } model
		 */
		placeRevision: function( model ) {
			this.hideLoading();

			// Place revision title, content and excerpt if each one exists.
			_.each( this.current, function( $element, key ){
				$element.empty().append( this.getHTML( model, key ) );
			}, this );

			this.addTemplates( model.get( 'js_templates' ) );
			this.loadAssets( model.get( 'assets' ) );

			// Update revision information display
			this.refreshInfo( this.model.get( 'currentInfo' ) );
		},

		/**
		 * Parses information returned for styles and scripts.
		 */
		addTemplates: function( js_templates ) {
			// If additional JS templates are required by the revision, add them
			if ( ! _.isEmpty( js_templates ) ) {
				revview.js_templates = revview.js_templates.concat( _.pluck( js_templates, 'id' ) );
				$( 'body' ).append( $( _.pluck( js_templates, 'content' ).join( '\n' ) ) );
			}
		},

		/**
		 * Parses information returned for styles and scripts.
		 */
		loadAssets: function( response ) {

			// Check for and parse our response.
			if ( _.isUndefined( response ) ) {
				return;
			}

			// If additional scripts are required by the revision, parse them
			if ( _.isObject( response.scripts ) ) {
				// Count scripts that will be loaded
				var countScripts = response.scripts.length - 1;
				$( response.scripts ).each( function() {
					var elementToAppendTo = this.footer ? 'body' : 'head';

					// Add script handle to list of those already parsed
					revview.scripts.push( this.handle );

					// Output extra data, if present
					if ( this.extra_data ) {
						var data = document.createElement('script'),
							dataContent = document.createTextNode( "//<![CDATA[ \n" + this.extra_data + "\n//]]>" );

						data.type = 'text/javascript';
						data.appendChild( dataContent );

						document.getElementsByTagName( elementToAppendTo )[0].appendChild(data);
					}

					// Build script tag and append to DOM in requested location
					var script = document.createElement('script');
					script.type = 'text/javascript';
					script.src = this.src;
					script.id = this.handle;
					script.onload = function(){
						// When all scripts are loaded, trigger window 'onload' event.
						if ( 0 === countScripts ) {
							$( window ).trigger( 'load' );
						}
						// If script loaded, there's one less to load.
						countScripts--;
					};
					script.onerror = function() {
						// If some script failed to load, that's one less to load too.
						countScripts--;
					};

					if ( 'wp-mediaelement' === this.handle && 'undefined' === typeof mejs ) {
						self.wpMediaelement = {};
						self.wpMediaelement.tag = script;
						self.wpMediaelement.element = elementToAppendTo;
						setTimeout( self.maybeLoadMejs.bind( self ), 250 );
					} else {
						document.getElementsByTagName( elementToAppendTo )[0].appendChild(script);
					}
				} );
			}

			// If additional stylesheets are required by the revision, parse them
			if ( _.isObject( response.styles ) ) {
				$( response.styles ).each( function() {
					// Add stylesheet handle to list of those already parsed
					revview.styles.push( this.handle );

					// Build link tag
					var style = document.createElement('link');
					style.rel = 'stylesheet';
					style.href = this.src;
					style.id = this.handle + '-css';

					// Destroy link tag if a conditional statement is present and either the browser isn't IE, or the conditional doesn't evaluate true
					if ( this.conditional && ( ! isIE || ! eval( this.conditional.replace( /%ver/g, IEVersion ) ) ) ) {
						style = false;
					}

					// Append link tag if necessary
					if ( style ) {
						document.getElementsByTagName('head')[0].appendChild(style);
					}
				} );
			}
		},

		/**
		 * Check if title, content or excerpt are available in the model, even if they're empty,
		 * and return them as HTML for insertion.
		 *
		 * @param { Object } model
		 * @param { string } field
		 * @returns { String } Markup to insert.
		 */
		getHTML: function( model, field ) {
			var properties = model.toJSON(),
				rendered = '';
			if ( properties.hasOwnProperty( field ) ) {
				var property = properties[field];
				if ( ! _.isUndefined( property.rendered ) ) {
					rendered = property.rendered;
				}
			}
			return $( '<div>' + rendered + '</div>' ).html();
		},

		refreshInfo: function( currentInfo ) {
			if ( !_.isUndefined( currentInfo ) ) {
				this.revisionInfo.model.set( currentInfo );
			}
		},

		showLoading: function() {
			this.$el.addClass( 'revview-loading' );
		},

		hideLoading: function() {
			this.$el.removeClass( 'revview-loading' );
		}
	});

	// Load all revision IDs
	var RevisionSelector = new revview.RevisionSelectorModel,
		RevisionTooltip = new revview.RevisionTooltipModel,
		RevisionInfo = new revview.RevisionInfoModel,
		RevisionApp;

	$(document).ready(function(){

		RevisionApp = new revview.RevisionApp({
			model: new revview.RevisionAppModel,
			collection: new revview.RevisionList
		});

	});

})( jQuery );