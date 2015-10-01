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

		selectionBar: {
			width: 0,
			leftOffset: 0
		},

		initialize: function() {
			this.listenTo( this.model, 'change:display', this.render );
			this.listenTo( this.model, 'change:mouseX', this.updatePosition );
			this.listenTo( this.model, 'change:visible', this.updateVisibility );
			this.$el.hide();
		},

		updatePosition: function() {
			var tooltipX = this.model.get( 'mouseX' ),
				tooltipWidth = this.$el.outerWidth(),
				tooltipDetect = tooltipX,
				selectionBar = this.selectionBar,
				detectLeft = selectionBar.leftOffset + ( tooltipWidth / 4 ),
				detectRight = selectionBar.leftOffset + selectionBar.width - ( tooltipWidth / 2 );

			// Left edge
			if ( detectLeft >= tooltipDetect ) {
				if ( ! this.$el.hasClass( 'revview-tooltip-left' ) ) {
					this.$el.addClass( 'revview-tooltip-left' ).removeClass( 'revview-tooltip-right' );
				}
			} else {
				this.$el.removeClass( 'revview-tooltip-left' );
			}

			// Right edge
			if ( detectRight <= tooltipDetect ) {
				if ( ! this.$el.hasClass( 'revview-tooltip-right' ) ) {
					this.$el.addClass( 'revview-tooltip-right' ).removeClass( 'revview-tooltip-left' );
				}
			} else {
				this.$el.removeClass( 'revview-tooltip-right' );
			}

			this.$el.css( 'left', tooltipX + 'px' );
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

			_.bindAll( this, 'stop', 'mouseMove', 'mouseLeave', 'mouseEnter', 'refreshBarOffset' );

			this.refreshTooltip = _.throttle( this.refreshTooltip, 150 );

			// Update selection bar offset
			this.refreshBarOffset = _.debounce( this.refreshBarOffset, 150 );
			$(window).on( 'resize', this.refreshBarOffset );
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

			this.refreshBarOffset();

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
			var offset = $obj.offset();
			return $(window).width()  - offset.left - $obj.outerWidth();
		},

		mouseEnter: function() {
			this.tooltip.model.set( 'visible', true );
		},

		mouseLeave: function() {
			this.tooltip.model.set( 'visible', false );
		},

		/**
		 * Update mouse position above selection bar in tooltip model.
		 */
		refreshTooltip: function() {
			this.tooltip.model.set( 'display', this.selectorRevisions[this.currentRevisionIndex] );
		},

		/**
		 * Update left offset and width of selection bar in tooltip model.
		 */
		refreshBarOffset: function() {
			this.tooltip.selectionBar = {
				'width': this.$el.outerWidth(),
				'leftOffset': this.$el.offset().left
			};
			this.tooltip.model.trigger( 'change:mouseX' );
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

		current: {},  // title, excerpt and content in iframe
		original: {}, // title, excerpt and content in top

		template: wp.template( 'revview-app' ),

		$iframe: null,

		events: {
			'click .revview-start': 'startRevisions',
			'click .revview-stop' : 'stopRevisions',
			'update'              : 'renderAreaLoaded'
		},

		initialize: function() {
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
			this.listenTo( this.revisionInfo.model, 'change', this.hideLoading );
			this.listenTo( this.model, 'change:currentRevision', this.changeRevision );
			this.listenTo( this.collection, 'change', this.placeRevision );
			this.listenToOnce( this.collection, 'sync', this.firstSync );

			// Add revision UI to page
			$( 'body' ).append( this.render().$el );

			// Save title, content and excerpt in page
			this.original = this.getOriginalElements();

			// Save reference to iframe
			this.$iframe = this.$el.find( '#revview-render' );

			// Bind function for iframe initial load
			this.$iframe.one( 'load', _.bind( this.renderAreaInit, this ) );
		},

		/**
		 * Called by button to view revisions.
		 */
		startRevisions: function() {
			this.showUI();
			if ( this.model.get( 'initialized' ) ) {
				this.loadLastRevision( this.model.get( 'lastRevision' ) );
			} else {
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
		 * Render revision selector.
		 *
		 * @returns {revview.RevisionApp}
		 */
		render: function() {
			this.$el.append( this.template() );
			return this;
		},

		loadLastRevision: function( index ) {
			this.model.set( 'currentRevision', index );
			this.model.set( 'currentInfo', this.revisionSelector.selectorRevisions[index] );
			this.model.trigger( 'change:currentRevision' );

			// Focus handle so user can use previous/next keyboard arrows to go through the revisions.
			this.$el.find( '.ui-slider-handle' ).focus();
		},

		/**
		 * Fired when the revision index changes. Will fetch the selected revision if the full data is not in collection.
		 */
		changeRevision: function() {
			this.showLoading();
			this.collection.getRevision( this.model.get( 'currentRevision' ) );
		},

		/**
		 * Revision UI has been initialized and iframe loaded.
		 * Save reference to iframe elements.
		 * Display last revision information.
		 * Flag app as initialized.
		 */
		renderAreaInit: function() {
			// Get title, content and excerpt in page and save them
			this.current = this.getAvailableElements();

			// Last revision is the same than current content so don't load it, only update info displayed.
			this.model.set( 'currentInfo', this.revisionSelector.selectorRevisions[0] );
			this.model.trigger( 'change:currentRevision' );

			// App is now initialized
			this.model.set( 'initialized', true );
		},

		/**
		 * Revision UI has been initialized and iframe loaded. Load last revision.
		 */
		renderAreaLoaded: function() {
			// Place revision title, content and excerpt if each one exists.
			_.each( this.original, function ( $element, key ) {
				$element.empty().append( this.current[key].html() );
			}, this );
		},

		/**
		 * Triggers iframe's window onload event, so scripts in it can listen to it, and tells the app to update.
		 */
		renderAreaOnLoad: function() {
			this.$iframe.get(0).contentWindow.revviewIframeWindowLoad();
			this.$el.trigger( 'update' );
		},

		/**
		 * Return available title, content and excerpt IN IFRAME as jQuery objects.
		 *
		 * @returns { Object }
		 */
		getAvailableElements: function() {
			var elements = {};
			_.each( ['title', 'content', 'excerpt'], function ( element ) {
				var $element = this.$iframe.contents().find( '.revview-' + element ).eq( 0 ).parent();
				if ( $element.length > 0 ) {
					elements[element] = $element;
				}
			}, this );
			return elements;
		},

		/**
		 * Return available title, content and excerpt IN MAIN PAGE as jQuery objects.
		 *
		 * @returns { Object }
		 */
		getOriginalElements: function() {
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
		 * Replace current title, content and excerpt with those in selected revision.
		 * Updates displayed revision information.
		 *
		 * @param { Object } model
		 */
		placeRevision: function( model ) {
			this.hideLoading();

			// Place revision title, content and excerpt IN IFRAME if each one exists.
			_.each( this.current, function( $element, key ){
				$element.empty().append( this.getHTML( model, key ) );
			}, this );

			// Add JS templates to iframe
			this.addTemplates( model.get( 'js_templates' ) );

			// Load styles and scripts
			this.loadAssets( model.get( 'assets' ) );

			// Update revision information display
			this.refreshInfo( this.model.get( 'currentInfo' ) );
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

				// Add current page to iframe with ?revview=render
				this.$iframe.attr( 'src', revview.permalink );
			}
		},

		/**
		 * Parses information returned for styles and scripts.
		 */
		addTemplates: function( js_templates ) {
			// If additional JS templates are required by the revision, add them
			if ( ! _.isEmpty( js_templates ) ) {
				revview.js_templates = revview.js_templates.concat( _.pluck( js_templates, 'id' ) );
				this.$iframe.contents().find( 'body' ).append( $( _.pluck( js_templates, 'content' ).join( '\n' ) ) );
			}
		},

		/**
		 * Parses information returned for styles and scripts.
		 */
		loadAssets: function( response ) {
			var isIE = ( -1 != navigator.userAgent.search( 'MSIE' ) );
			if ( isIE ) {
				var IEVersion = navigator.userAgent.match(/MSIE\s?(\d+)\.?\d*;/);
				IEVersion = parseInt( IEVersion[1] );
			}

			// Check for and parse our response.
			if ( _.isEmpty( response ) || _.isUndefined( response ) ) {
				this.renderAreaOnLoad();
				return;
			}

			// If additional scripts are required by the revision, parse them
			if ( _.isObject( response.scripts ) ) {
				// Count scripts that will be loaded
				if ( response.scripts.length > 0 ) {
					var countScripts = response.scripts.length - 1;
					_.each( response.scripts, function( required ) {
						var elementToAppendTo = required.footer ? 'body' : 'head',
							$iframeAppendTo = this.$iframe.contents().find( elementToAppendTo ).get(0);

						// Add script handle to list of those already parsed
						revview.scripts.push( required.handle );

						// Output extra data, if present
						if ( required.extra_data ) {
							var data = document.createElement('script'),
								dataContent = document.createTextNode( "//<![CDATA[ \n" + required.extra_data + "\n//]]>" );
							data.type = 'text/javascript';
							data.appendChild( dataContent );
							$iframeAppendTo.appendChild( data );
						}

						// Build script tag and append to DOM in requested location
						var script = document.createElement('script');
						script.type = 'text/javascript';
						script.src = required.src;
						script.id = required.handle;
						script.onload = _.bind( function() {
							// When all scripts are loaded, trigger window 'onload' event.
							if ( 0 === countScripts ) {
								this.renderAreaOnLoad();
							}
							// If script loaded, there's one less to load.
							countScripts--;
						}, this );
						script.onerror = function() {
							// If some script failed to load, that's one less to load too.
							countScripts--;
						};

						if ( 'wp-mediaelement' === required.handle && 'undefined' === typeof mejs ) {
							this.wpMediaelement = {};
							this.wpMediaelement.tag = script;
							this.wpMediaelement.element = elementToAppendTo;
							setTimeout( this.maybeLoadMejs.bind( this ), 250 );
						} else {
							var scriptIsLoaded = this.$iframe.contents().find( 'script[src="' + required.src + '"]' );
							if ( scriptIsLoaded.length > 0 ) {
								scriptIsLoaded.remove();
							}
							$iframeAppendTo.appendChild( script );
						}
					}, this );
				} else {
					this.renderAreaOnLoad();
				}
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