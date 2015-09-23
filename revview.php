<?php
/**
 * Plugin Name: Revview
 * Plugin URI: https://github.com/eliorivero/revview
 * Description: Displays revisions of a post using REST API. Requires <a href="https://github.com/WP-API/WP-API">REST API plugin 2.0</a>.
 * Author: Elio Rivero
 * Version: 1.0
 * Author URI: http://queryloop.com/
 * License: GPL2
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Domain Path: /languages
 * Text Domain: revview
 */

if ( ! defined( 'ABSPATH' ) ) {
	// Exit if accessed directly
	exit;
}

/**
 * Class Revview
 *
 * @since 1.0.0
 */
class Revview {

	/**
	 * Class constructor
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function __construct() {
		add_action( 'plugins_loaded', array( $this, 'localization' ) );
		add_action( 'rest_api_init', array( $this, 'register_route_public_revisions' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );

		add_filter( 'the_title', array( $this, 'revview_title' ) );
		add_filter( 'the_content', array( $this, 'revview_content' ) );
		add_filter( 'the_excerpt', array( $this, 'revview_excerpt' ) );
	}

	/**
	 * Registers endpoint to publicly access revisions of a specific post.
	 * Endpoint is /wp-json/wp/v2/posts/(?P<parent_id>[\d]+)/revisions/public
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_route_public_revisions() {
		require_once 'wp-rest-public-revisions-controller.php';
		foreach ( get_post_types( array( 'show_in_rest' => true ), 'objects' ) as $post_type ) {
			if ( post_type_supports( $post_type->name, 'revisions' ) ) {
				$revisions_controller = new WP_REST_Public_Revisions_Controller( $post_type->name );
				$revisions_controller->register_routes();
			}
		}
	}

	/**
	 * Initialize localization routines
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function localization() {
		load_plugin_textdomain( 'revview', false, dirname( plugin_basename( __FILE__ ) ) . '/languages/' );
	}

	/**
	 * Register JS and CSS files to load in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_assets() {
		if ( is_singular() && $this->is_post_visible_in_rest() ) {
			add_action( 'wp_footer', array( $this, 'print_templates' ) );
			wp_enqueue_style( 'revview', plugins_url( 'css/revview-front.css' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-front.js' , __FILE__ ), array( 'wp-api', 'wp-util' ) );
			wp_localize_script( 'revview', 'revview', array(
				'root' => esc_url_raw( get_rest_url() ),
				'post_id' => get_the_ID(),
			) );
		}
	}

	/**
	 * Checks if type of current post is visible in REST.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return bool
	 */
	public function is_post_visible_in_rest() {
		static $is_visible;
		if ( ! isset( $is_visible ) ) {
			$post_type = get_post_type();
			$is_visible = in_array( $post_type, get_post_types( array( 'show_in_rest' => true ) )  );
		}
		return $is_visible;
	}

	/**
	 * Prints templates for revision display interface in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function print_templates() {
		?>
		<script id="tmpl-revview-list-item" type="text/html">
			<a class="revview-revision-item" data-revision_id="{{ data.id }}">
				<span class="revview-revision-date">{{ data.date }}</span>
				<span class="revview-revision-author">{{ data.author_name }}</span>
			</a>
		</script>
		<?php
	}

	/**
	 * Checks whether this is a REST request or not.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return bool
	 */
	function is_rest_request() {
		return defined( 'REST_REQUEST' ) && REST_REQUEST;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the title.
	 *
	 * @param string $title
	 *
	 * @return string
	 */
	function revview_title( $title = '' ) {
		return $this->is_rest_request() || ! in_the_loop() ? $title : $title . '<span class="revview-title"></span>';
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the content.
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	function revview_content( $content = '' ) {
		return $this->is_rest_request() || ! in_the_loop() ? $content : '<div class="revview-content"></div>' . $content;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the excerpt.
	 *
	 * @param string $excerpt
	 *
	 * @return string
	 */
	function revview_excerpt( $excerpt = '' ) {
		return $this->is_rest_request() || ! in_the_loop() ? $excerpt : $excerpt . '<div class="revview-excerpt"></div>';
	}
}

new Revview();