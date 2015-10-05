/**
 * Revview - Button to initialize revision selection.
 */
var revviewLoader;
(function ( document ) {
	'use strict';

	function addQueryArg( key, value, url ) {
		url = url || window.location.href;
		var re = new RegExp( "([?&])" + key + "=.*?(&|#|$)(.*)", "gi" ), hash;
		if ( re.test( url ) ) {
			if ( typeof value !== 'undefined' && value !== null ) {
				return url.replace( re, '$1' + key + "=" + value + '$2$3' );
			} else {
				hash = url.split( '#' );
				url = hash[0].replace( re, '$1$3' ).replace( /(&|\?)$/, '' );
				if ( typeof hash[1] !== 'undefined' && hash[1] !== null ) {
					url += '#' + hash[1];
				}
				return url;
			}
		} else {
			if ( typeof value !== 'undefined' && value !== null ) {
				var separator = url.indexOf( '?' ) !== -1 ? '&' : '?';
				hash = url.split( '#' );
				url = hash[0] + separator + key + '=' + value;
				if ( typeof hash[1] !== 'undefined' && hash[1] !== null ) {
					url += '#' + hash[1];
				}
				return url;
			} else {
				return url;
			}
		}
	}

	window.onload = function () {
		var wrapper = document.createElement( 'div' ),
			start = document.createElement( 'button' );

		wrapper.id = 'revview';
		start.textContent = revviewLoader.view_revisions;
		start.className = 'revview-button revview-start';
		start.addEventListener( 'click', function () {
			document.location = addQueryArg( 'revview', 'enabled', document.location.href );
		} );
		wrapper.appendChild( start );
		document.body.appendChild( wrapper );
	};
})( document );
