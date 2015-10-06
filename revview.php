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
		if ( isset( $_GET['revview'] ) ) {
			if ( 'render' === $_GET['revview'] ) {
				add_filter( 'show_admin_bar', '__return_false' );
				add_action( 'wp_footer', array( $this, 'revision_loaded_messenger' ) );
			} else {
				add_action( 'wp_enqueue_scripts', array( $this, 'register_selection_ui_assets' ) );
				add_filter( 'single_template', array( $this, 'replace_singular_template' ) );
				add_filter( 'body_class', array( $this, 'body_class' ) );
			}
		} else {
			add_action( 'rest_api_init', array( $this, 'register_route_public_revisions' ) );
			add_action( 'wp_enqueue_scripts', array( $this, 'register_loader_assets' ) );
		}
		add_action( 'loop_start', array( $this, 'add_discoverable_elements' ) );
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
	 * Register JS and CSS files to load in front end.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_loader_assets() {
		$post = get_post();
		if ( is_singular() && $this->can_view_revisions() && empty( $post->post_password ) ) {
			wp_enqueue_style( 'revview', plugins_url( 'css/revview-loader.css' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-loader.js' , __FILE__ ) );
			wp_localize_script( 'revview', 'revviewLoader', apply_filters( 'revview_loader_js_variables', array(
				'view_revisions' => esc_html__( 'View Revisions', 'revview' ),
			) ) );
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
	public function register_selection_ui_assets() {
		if ( is_singular() && $this->can_view_revisions() ) {
			add_action( 'wp_footer', array( $this, 'print_templates' ) );

			wp_enqueue_style( 'revview', plugins_url( 'css/revview-front.css' , __FILE__ ) );
			wp_register_script( 'revview-date', plugins_url( 'js/revview-date.js' , __FILE__ ) );
			wp_enqueue_script( 'revview', plugins_url( 'js/revview-front.js' , __FILE__ ), array( 'wp-api', 'wp-util', 'jquery-ui-slider', 'revview-date'
			) );
			wp_localize_script( 'revview', 'revview', apply_filters( 'revview_selection_ui_js_variables', array(
				'post_id' => get_the_ID(),
				'datetime_format' => get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
			) ) );
		}
	}

	/**
	 * In singular views, check if we should look for templates of this plugin.
	 *
	 * @since 1.0.0
	 *
	 * @param $template
	 *
	 * @return mixed|void
	 */
	function replace_singular_template( $template ) {
		if ( is_singular() && $this->can_view_revisions() ) {
			return $this->get_template( 'singular' );
		}
		return $template;
	}

	/**
	 * Replace template for singular view for one that only loads Revview selection UI and the iframe to view revisions.
	 *
	 * @since 1.0.0
	 *
	 * @param string $template
	 *
	 * @return mixed|void
	 */
	function get_template( $template ) {
		$template = $template . '.php';
		$file = plugin_dir_path( __FILE__ ) . 'templates/' . $template;
		return apply_filters( 'revview_singular_template_' . $template, $file );
	}

	/**
	 * If we've loaded Revview selection UI, set identifying class and detect theme.
	 *
	 * @since 1.0.0
	 *
	 * @param array $classes
	 *
	 * @return array
	 */
	function body_class( $classes ) {
		$classes[] = 'revview-ui';

		$classes[] = get_stylesheet();

		return $classes;
	}

	/**
	 * In revision preview loaded in iframe, writes JS that sends a message to top window,
	 * reporting that iframe load finished.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function revision_loaded_messenger() {
		?>
		<script type="text/javascript">
			(function(window){
				window.addEventListener( 'load', function() {
					window.top.postMessage( 'revview-synced', window.document.origin );
				});
			})(window);
		</script>
		<?php
	}

	/**
	 * Checks if type of current post is visible in REST.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return bool
	 */
	public function can_view_revisions() {
		static $is_visible;
		if ( ! isset( $is_visible ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post && wp_revisions_enabled( $post ) && 1 < count( wp_get_post_revisions() ) ) {
				$post_type = get_post_type_object( get_post_type( $post ) );
				$is_visible = isset( $post_type->show_in_rest ) && $post_type->show_in_rest;
			} else {
				$is_visible = false;
			}
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
		<script id="tmpl-revview-app" type="text/html">
			<button class="revview-button revview-stop"><?php esc_html_e( '&times;', 'revview' ) ?></button>
		</script>
		<script id="tmpl-revview-tooltip" type="text/html">
			<span class="revview-tooltip-date">{{ data.display.date }}</span>
			<span class="revview-tooltip-author"><em><?php esc_html_e( 'By', 'revview' ); ?></em> {{ data.display.author_name }}</span>
		</script>
		<script id="tmpl-revview-info" type="text/html">
			<h4 class="revview-info-heading"><?php esc_html_e( 'Current Revision', 'revview' ) ?></h4> <span class="revview-info-date">{{ data.date }}</span> <?php esc_html_e( 'by', 'revview' ); ?> <span class="revview-info-author">{{ data.author_name }}</span>
		</script>
		<?php
	}

	/**
	 * If a loop started, check if it's the main query, in which case, add filters to append divs.
	 *
	 * @param object $wp_query
	 */
	function add_discoverable_elements( $wp_query ) {
		if ( $wp_query->is_main_query() ) {
			add_filter( 'the_title', array( $this, 'revview_title' ), 0 );
			add_filter( 'the_content', array( $this, 'revview_content' ), 0 );
			add_filter( 'the_excerpt', array( $this, 'revview_excerpt' ), 0 );
		}
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the title.
	 *
	 * @param string $title
	 *
	 * @return string
	 */
	function revview_title( $title = '' ) {
		if ( isset( $_POST['title'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_title', $_POST['title'], $post->ID, 'display' );
			}
		}
		return $title;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the content.
	 *
	 * @param string $content
	 *
	 * @return string
	 */
	function revview_content( $content = '' ) {
		if ( isset( $_POST['content'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_content', $_POST['content'], $post->ID, 'display' );
			}
		}
		return $content;
	}

	/**
	 * Appends a div that will be used in JS to get the closest parent wrapper and replace the excerpt.
	 *
	 * @param string $excerpt
	 *
	 * @return string
	 */
	function revview_excerpt( $excerpt = '' ) {
		if ( isset( $_POST['excerpt'] ) ) {
			$post = get_post();
			if ( $post instanceof WP_Post ) {
				return sanitize_post_field( 'post_excerpt', $_POST['excerpt'], $post->ID, 'display' );
			}
		}
		return $excerpt;
	}
}

new Revview();