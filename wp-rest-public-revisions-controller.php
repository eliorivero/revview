<?php
/**
 * Add new endpoint to allow public access to revisions
 *
 * @since 1.0.0
 */
class WP_REST_Public_Revisions_Controller extends WP_REST_Controller {

	/**
	 * Post type of the parent post of these revisions.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var string
	 */
	private $parent_post_type;

	/**
	 * Controller for post object.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var object
	 */
	private $parent_controller;

	/**
	 * Base path for the post type endpoint.
	 *
	 * @since 1.0.0
	 * @access private
	 *
	 * @var string
	 */
	private $parent_base;

	/**
	 * Class constructor
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string $parent_post_type Name of the post type.
	 */
	public function __construct( $parent_post_type ) {
		$this->parent_post_type = $parent_post_type;
		$this->parent_controller = new WP_REST_Posts_Controller( $parent_post_type );
		$this->parent_base = $this->parent_controller->get_post_type_base( $this->parent_post_type );
	}

	/**
	 * Register routes for revisions based on post types supporting revisions
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_routes() {

		register_rest_route( 'revview/v1', '/' . $this->parent_base . '/(?P<parent_id>[\d]+)/revisions', array(
			array(
				'methods'         => WP_REST_Server::READABLE,
				'callback'        => array( $this, 'get_items' ),
				'permission_callback' => array( $this, 'get_items_permissions_check' ),
				'args'            => array(
					'context'     => array(
						'default' => 'view',
					),
					'parent_id'	  => array(
						'validate_callback' => array( $this, 'validate_post_id' )
					),
				),
			),

			'schema' => array( $this, 'get_public_item_schema' ),
		) );

		register_rest_route( 'revview/v1', '/' . $this->parent_base . '/(?P<parent_id>[\d]+)/revisions/ids', array(
			array(
				'methods'         => WP_REST_Server::READABLE,
				'callback'        => array( $this, 'get_revision_ids' ),
				'permission_callback' => array( $this, 'get_items_permissions_check' ),
				'args'            => array(
					'context'     => array(
						'default' => 'view',
					),
					'parent_id'	  => array(
						'validate_callback' => array( $this, 'validate_post_id' )
					),
				),
			),

			'schema' => array( $this, 'get_public_item_schema' ),
		) );

		register_rest_route( 'revview/v1', '/' . $this->parent_base . '/(?P<parent_id>[\d]+)/revisions/(?P<revision_id>[\d]+)', array(
			array(
				'methods'         => WP_REST_Server::READABLE,
				'callback'        => array( $this, 'get_item' ),
				'permission_callback' => array( $this, 'get_item_permissions_check' ),
				'args'            => array(
					'context'     => array(
						'default' => 'view',
					),
					'parent_id'	  => array(
						'validate_callback' => array( $this, 'validate_post_id' )
					),
					'revision_id' => array(
						'validate_callback' => array( $this, 'validate_post_id' )
					),
				),
			),

			'schema' => array( $this, 'get_public_item_schema' ),
		) );

	}

	/**
	 * Checks whether the parameter is potentially a valid post ID.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param int $parameter
	 *
	 * @return bool
	 */
	public function validate_post_id( $parameter = 0 ) {
		return ( is_numeric( $parameter ) && $parameter > 0 );
	}

	/**
	 * Get a collection of revisions.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 * @return WP_Error|WP_REST_Response
	 */
	public function get_items( $request ) {

		$parent = get_post( $request['parent_id'] );
		if ( ! $request['parent_id'] || ! $parent || $this->parent_post_type !== $parent->post_type ) {
			return new WP_Error( 'rest_post_invalid_parent_id', __( 'Invalid post parent ID.' ), array( 'status' => 404 ) );
		}

		$revisions = wp_get_post_revisions( $request['parent_id'] );

		$struct = array();
		foreach ( $revisions as $revision ) {
			$struct[] = $this->prepare_item_for_response( $revision, $request );
		}
		return $struct;
	}

	/**
	 * Get a collection of IDs of revisions.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 * @return WP_Error|WP_REST_Response
	 */
	public function get_revision_ids( $request ) {

		$parent = get_post( $request['parent_id'] );
		if ( ! $request['parent_id'] || ! $parent || $this->parent_post_type !== $parent->post_type ) {
			return new WP_Error( 'rest_post_invalid_parent_id', __( 'Invalid post parent ID.' ), array( 'status' => 404 ) );
		}

		$revisions = wp_get_post_revisions( $request['parent_id'] );

		$struct = array();
		foreach ( $revisions as $revision ) {
			$struct[] = $this->prepare_ids_for_response( $revision, $request );
		}
		return $struct;
	}

	/**
	 * Check if a given request has access to get revisions.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 * @return WP_Error|bool
	 */
	public function get_items_permissions_check( $request ) {

		$parent = get_post( $request['parent_id'] );

		if ( ! $parent ) {
			return true;
		}

		$post_status_object = get_post_status_object( $parent->post_status );

		if ( $post_status_object->public && empty( $parent->post_password ) ) {
			return true;
		}

		return new WP_Error( 'rest_cannot_read', __( 'Revisions are unavailable for this post.' ), array( 'status' => 403 ) );
	}

	/**
	 * Get a revision.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 * @return WP_Error|WP_REST_Response
	 */
	public function get_item( $request ) {

		$parent = get_post( $request['parent_id'] );
		if ( ! $request['parent_id'] || ! $parent || $this->parent_post_type !== $parent->post_type ) {
			return new WP_Error( 'rest_post_invalid_parent_id', __( 'Invalid post parent ID.' ), array( 'status' => 404 ) );
		}

		$revision = wp_get_post_revision( $request['revision_id'] );
		if ( is_null( $revision ) ) {
			return new WP_Error( 'rest_post_invalid_revision_id', __( 'Invalid post revision ID.' ), array( 'status' => 404 ) );
		}

		return $this->prepare_item_for_response( $revision, $request );
	}

	/**
	 * Check if a given request has access to get a specific revision
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 * @return WP_Error|bool
	 */
	public function get_item_permissions_check( $request ) {
		return $this->get_items_permissions_check( $request );
	}

	/**
	 * Prepare the revision for the REST response
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param mixed $post WordPress representation of the revision.
	 * @param WP_REST_Request $request Request object.
	 * @return array
	 */
	public function prepare_item_for_response( $post, $request ) {
		$GLOBALS['post'] = $post;
		setup_postdata( $post );

		// Base fields for every post
		$data = array(
			'author'       => $post->post_author,
			'date'         => $this->prepare_date_response( $post->post_date_gmt, $post->post_date ),
			'date_gmt'     => $this->prepare_date_response( $post->post_date_gmt ),
			'guid'         => $post->guid,
			'id'           => $post->ID,
			'modified'     => $this->prepare_date_response( $post->post_modified_gmt, $post->post_modified ),
			'modified_gmt' => $this->prepare_date_response( $post->post_modified_gmt ),
			'parent'       => (int) $post->post_parent,
			'slug'         => $post->post_name,
		);

		$schema = $this->get_item_schema();

		if ( ! empty( $schema['properties']['title'] ) ) {
			$data['title'] = array(
				'rendered' 	=> get_the_title( $post->ID ),
			);
		}

		if ( ! empty( $schema['properties']['content'] ) ) {
			if ( ! empty( $post->post_password ) ) {
				$this->prepare_password_response( $post->post_password );
			}

			$data['content'] = array(
				'rendered' 	=> apply_filters( 'the_content', $post->post_content ),
			);
		}

		if ( ! empty( $schema['properties']['excerpt'] ) ) {
			$data['excerpt'] = array(
				'rendered' 	=> $this->prepare_excerpt_response( $post->post_excerpt ),
			);
		}

		$is_single_revision = $request->get_param( 'revision_id' );
		if ( ! is_null( $is_single_revision ) ) {

			$GLOBALS['wp_query'] = new WP_Query( array(
				'p' => $post->ID,
				'post_type' => 'revision',
			) );
			$GLOBALS['wp_query']->posts = array( $post );
			$GLOBALS['wp_query']->post = $post;
			$GLOBALS['wp_query']->post_count = 1;
			$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];

			$results = array();

			if ( have_posts() ) {

				ob_start();
				wp_head();
				while ( ob_get_length() ) {
					ob_end_clean();
				}

				the_post();
				the_title();
				the_excerpt();
				the_content();

				ob_start();
				wp_footer();
				while ( ob_get_length() ) {
					ob_end_clean();
				}

				$data['assets'] = $this->prepare_styles_and_scripts( $results, $request );
			}
		}

		$context = ! empty( $request['context'] ) ? $request['context'] : 'view';
		$data = $this->filter_response_by_context( $data, $context );
		$data = $this->add_additional_fields_to_object( $data, $request );
		$response = rest_ensure_response( $data );
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		if ( ! empty( $data['parent'] ) ) {
			$response->add_link( 'parent', rest_url( sprintf( 'wp/%s/%d', $this->parent_base, $data['parent'] ) ) );
		}

		return apply_filters( 'rest_prepare_' . $post->post_type . '_public_revisions', $response, $post, $request );
	}

	/**

	/**
	 * Identify additional scripts required by the latest set of IS posts and provide the necessary data to the IS response handler.
	 *
	 * @param  array $results
	 * @param  WP_REST_REQUEST $request
	 *
	 * @return array
	 * @internal param $query_args
	 * @internal param $wp_query
	 *
	 * @global   $wp_scripts, $wp_scripts
	 * @uses     sanitize_text_field, add_query_arg
	 */
	function prepare_styles_and_scripts( $results, $request ) {

		// Get scripts already loaded
		/**
		 * TODO: some way to know which scripts are loaded but must be re-executed after loading selected revision?
		 * If the line below is replaced with
		 * $sent_scripts = explode( ',', $request->get_header('x_wp_revview_scripts') );
		 * a script that was loaded and run on page load, won't be loaded and run again when fetching a revision that needs it.
		 * The following scripts are loaded for the revview UI so they never need to be loaded again.
		 */
		$sent_scripts = array( 'jquery-core', 'jquery-migrate', 'jquery', 'underscore', 'backbone', 'wp-api', 'wp-util', 'jquery-ui-core', 'jquery-ui-widget', 'jquery-ui-mouse', 'jquery-ui-slider' );

		// Parse and sanitize the script handles already output
		$initial_scripts = is_array( $sent_scripts ) ? array_map( 'sanitize_text_field', $sent_scripts ) : false;

		if ( is_array( $initial_scripts ) ) {
			global $wp_scripts;

			// Identify new scripts needed by the latest set of IS posts
			$new_scripts = array_diff( $wp_scripts->done, $initial_scripts );

			// If new scripts are needed, extract relevant data from $wp_scripts
			if ( ! empty( $new_scripts ) ) {
				$results['scripts'] = array();

				foreach ( $new_scripts as $handle ) {
					// Abort if somehow the handle doesn't correspond to a registered script
					if ( ! isset( $wp_scripts->registered[ $handle ] ) )
						continue;

					// Provide basic script data
					$script_data = array(
						'handle'     => $handle,
						'footer'     => ( is_array( $wp_scripts->in_footer ) && in_array( $handle, $wp_scripts->in_footer ) ),
						'extra_data' => $wp_scripts->print_extra_script( $handle, false )
					);

					// Base source
					$src = $wp_scripts->registered[ $handle ]->src;

					// Take base_url into account
					if ( strpos( $src, 'http' ) !== 0 )
						$src = $wp_scripts->base_url . $src;

					// Version and additional arguments
					if ( null === $wp_scripts->registered[ $handle ]->ver )
						$ver = '';
					else
						$ver = $wp_scripts->registered[ $handle ]->ver ? $wp_scripts->registered[ $handle ]->ver : $wp_scripts->default_version;

					if ( isset( $wp_scripts->args[ $handle ] ) )
						$ver = $ver ? $ver . '&amp;' . $wp_scripts->args[$handle] : $wp_scripts->args[$handle];

					// Full script source with version info
					$script_data['src'] = add_query_arg( 'ver', $ver, $src );

					// Add script to data that will be returned to IS JS
					array_push( $results['scripts'], $script_data );
				}
			}
		}

		// Expose additional script data to filters, but only include in final `$results` array if needed.
		if ( ! isset( $results['scripts'] ) )
			$results['scripts'] = array();

		$results['scripts'] = apply_filters( 'revview_additional_scripts', $results['scripts'], $initial_scripts, $results );

		if ( empty( $results['scripts'] ) )
			unset( $results['scripts' ] );

		// Parse and sanitize the style handles already output
		$sent_styles = explode( ',', $request->get_header('x_wp_revview_styles') );
		$initial_styles = is_array( $sent_styles ) ? array_map( 'sanitize_text_field', $sent_styles ) : false;

		if ( is_array( $initial_styles ) ) {
			global $wp_styles;

			// Identify new styles needed by the latest set of IS posts
			$new_styles = array_diff( $wp_styles->done, $initial_styles );

			// If new styles are needed, extract relevant data from $wp_styles
			if ( ! empty( $new_styles ) ) {
				$results['styles'] = array();

				foreach ( $new_styles as $handle ) {
					// Abort if somehow the handle doesn't correspond to a registered stylesheet
					if ( ! isset( $wp_styles->registered[ $handle ] ) )
						continue;

					// Provide basic style data
					$style_data = array(
						'handle' => $handle,
						'media'  => 'all'
					);

					// Base source
					$src = $wp_styles->registered[ $handle ]->src;

					// Take base_url into account
					if ( strpos( $src, 'http' ) !== 0 )
						$src = $wp_styles->base_url . $src;

					// Version and additional arguments
					if ( null === $wp_styles->registered[ $handle ]->ver )
						$ver = '';
					else
						$ver = $wp_styles->registered[ $handle ]->ver ? $wp_styles->registered[ $handle ]->ver : $wp_styles->default_version;

					if ( isset($wp_styles->args[ $handle ] ) )
						$ver = $ver ? $ver . '&amp;' . $wp_styles->args[$handle] : $wp_styles->args[$handle];

					// Full stylesheet source with version info
					$style_data['src'] = add_query_arg( 'ver', $ver, $src );

					// Parse stylesheet's conditional comments if present, converting to logic executable in JS
					if ( isset( $wp_styles->registered[ $handle ]->extra['conditional'] ) && $wp_styles->registered[ $handle ]->extra['conditional'] ) {
						// First, convert conditional comment operators to standard logical operators. %ver is replaced in JS with the IE version
						$style_data['conditional'] = str_replace( array(
							'lte',
							'lt',
							'gte',
							'gt'
						), array(
							'%ver <=',
							'%ver <',
							'%ver >=',
							'%ver >',
						), $wp_styles->registered[ $handle ]->extra['conditional'] );

						// Next, replace any !IE checks. These shouldn't be present since WP's conditional stylesheet implementation doesn't support them, but someone could be _doing_it_wrong().
						$style_data['conditional'] = preg_replace( '#!\s*IE(\s*\d+){0}#i', '1==2', $style_data['conditional'] );

						// Lastly, remove the IE strings
						$style_data['conditional'] = str_replace( 'IE', '', $style_data['conditional'] );
					}

					// Parse requested media context for stylesheet
					if ( isset( $wp_styles->registered[ $handle ]->args ) )
						$style_data['media'] = esc_attr( $wp_styles->registered[ $handle ]->args );

					// Add stylesheet to data that will be returned to IS JS
					array_push( $results['styles'], $style_data );
				}
			}
		}

		// Expose additional stylesheet data to filters, but only include in final `$results` array if needed.
		if ( ! isset( $results['styles'] ) )
			$results['styles'] = array();

		$results['styles'] = apply_filters( 'revview_additional_styles', $results['styles'], $initial_styles, $results );

		if ( empty( $results['styles'] ) )
			unset( $results['styles' ] );

		// Lastly, return the IS results array
		return $results;
	}

	/**
	 * Prepare the revision for the REST response
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param mixed $post WordPress representation of the revision.
	 * @param WP_REST_Request $request Request object.
	 * @return array
	 */
	public function prepare_ids_for_response( $post, $request ) {
		$GLOBALS['post'] = $post;
		setup_postdata( $post );

		// Base fields for every post
		$data = array(
			'id' 	 => $post->ID,
			'author_name' => get_the_author_meta( 'user_nicename', $post->post_author ),
			'date'   => $this->prepare_date_response( $post->post_date_gmt, $post->post_date ),
		);

		$context = ! empty( $request['context'] ) ? $request['context'] : 'view';
		$data = $this->filter_response_by_context( $data, $context );
		$data = $this->add_additional_fields_to_object( $data, $request );
		$response = rest_ensure_response( $data );
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		if ( ! empty( $data['parent'] ) ) {
			$response->add_link( 'parent', rest_url( sprintf( 'wp/%s/%d', $this->parent_base, $data['parent'] ) ) );
		}

		return apply_filters( 'rest_prepare_' . $post->post_type . '_public_revision_ids', $response, $post, $request );
	}

	/**
	 * Check the post_date_gmt or modified_gmt and prepare any post or
	 * modified date for single post output.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string       $date_gmt
	 * @param string|null  $date
	 * @return string|null ISO8601/RFC3339 formatted datetime.
	 */
	protected function prepare_date_response( $date_gmt, $date = null ) {
		if ( '0000-00-00 00:00:00' === $date_gmt ) {
			return null;
		}

		if ( isset( $date ) ) {
			return rest_mysql_to_rfc3339( $date );
		}

		return rest_mysql_to_rfc3339( $date_gmt );
	}

	/**
	 * Check the post excerpt and prepare it for single post output.
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @param string       $excerpt
	 * @return string|null $excerpt
	 */
	protected function prepare_excerpt_response( $excerpt ) {
		if ( post_password_required() ) {
			return __( 'There is no excerpt because this is a protected post.' );
		}

		$excerpt = apply_filters( 'the_excerpt', apply_filters( 'get_the_excerpt', $excerpt ) );

		if ( empty( $excerpt ) ) {
			return '';
		}

		return $excerpt;
	}

	/**
	 * Get the revision's schema, conforming to JSON Schema
	 *
	 * @since 1.0.0
	 * @access public
	 *
	 * @return array
	 */
	public function get_item_schema() {
		$schema = array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => "{$this->parent_base}-revision",
			'type'       => 'object',
			/*
			 * Base properties for every Revision
			 */
			'properties' => array(
				'author'          => array(
					'description' => 'The ID for the author of the object.',
					'type'        => 'integer',
					'context'     => array( 'view' ),
				),
				'date'            => array(
					'description' => 'The date the object was published.',
					'type'        => 'string',
					'format'      => 'date-time',
					'context'     => array( 'view' ),
				),
				'date_gmt'        => array(
					'description' => 'The date the object was published, as GMT.',
					'type'        => 'string',
					'format'      => 'date-time',
					'context'     => array( 'view' ),
				),
				'guid'            => array(
					'description' => 'GUID for the object, as it exists in the database.',
					'type'        => 'string',
					'context'     => array( 'view' ),
				),
				'id'              => array(
					'description' => 'Unique identifier for the object.',
					'type'        => 'integer',
					'context'     => array( 'view' ),
				),
				'modified'        => array(
					'description' => 'The date the object was last modified.',
					'type'        => 'string',
					'format'      => 'date-time',
					'context'     => array( 'view' ),
				),
				'modified_gmt'    => array(
					'description' => 'The date the object was last modified, as GMT.',
					'type'        => 'string',
					'format'      => 'date-time',
					'context'     => array( 'view' ),
				),
				'parent'          => array(
					'description' => 'The ID for the parent of the object.',
					'type'        => 'integer',
					'context'     => array( 'view' ),
				),
				'slug'            => array(
					'description' => 'An alphanumeric identifier for the object unique to its type.',
					'type'        => 'string',
					'context'     => array( 'view' ),
				),
			),
		);

		$parent_schema = $this->parent_controller->get_item_schema();

		foreach ( array( 'title', 'content', 'excerpt' ) as $property ) {
			if ( empty( $parent_schema['properties'][ $property ] ) ) {
				continue;
			}

			switch ( $property ) {

				case 'title':
					$schema['properties']['title'] = array(
						'description' => 'Title for the object, as it exists in the database.',
						'type'        => 'string',
						'context'     => array( 'view' ),
						'properties'  => array(
							'raw' => array(
								'description' => 'Content for the object, as it exists in the database.',
								'type'        => 'string',
								'context'     => array( 'edit' ),
							),
							'rendered' => array(
								'description' => 'Content for the object, transformed for display.',
								'type'        => 'string',
								'context'     => array( 'view', 'edit' ),
							),
						),
					);
					break;

				case 'content':
					$schema['properties']['content'] = array(
						'description' => 'Content for the object, as it exists in the database.',
						'type'        => 'string',
						'context'     => array( 'view' ),
						'properties'  => array(
							'raw' => array(
								'description' => 'Content for the object, as it exists in the database.',
								'type'        => 'string',
								'context'     => array( 'edit' ),
							),
							'rendered' => array(
								'description' => 'Content for the object, transformed for display.',
								'type'        => 'string',
								'context'     => array( 'view', 'edit' ),
							),
						),
					);
					break;

				case 'excerpt':
					$schema['properties']['excerpt'] = array(
						'description' => 'Excerpt for the object, as it exists in the database.',
						'type'        => 'string',
						'context'     => array( 'view' ),
						'properties'  => array(
							'raw' => array(
								'description' => 'Content for the object, as it exists in the database.',
								'type'        => 'string',
								'context'     => array( 'edit' ),
							),
							'rendered' => array(
								'description' => 'Content for the object, transformed for display.',
								'type'        => 'string',
								'context'     => array( 'view', 'edit' ),
							),
						),
					);
					break;

			}
		}

		return $this->add_additional_fields_schema( $schema );
	}

}