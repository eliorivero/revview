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

		$response = array();
		foreach ( $revisions as $revision ) {
			$data = $this->prepare_ids_for_response( $revision, $request );
			$response[] = $this->prepare_response_for_collection( $data );
		}
		return $response;
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

		$parent_post_status = get_post_status_object( $parent->post_status );

		/**
		 * Filters the status of the parent entry whose revision was requested.
		 *
		 * @param bool $parent_post_status_public Whether the post status of the parent entry is public or not.
		 * @param int $post The ID of the entry parent of the requested revision.
		 */
		if ( apply_filters( 'revview_allow_revision_load', $parent_post_status->public && empty( $parent->post_password ), $parent->ID ) ) {
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

		$revision_id = $request['revision_id'];
		$revision = wp_get_post_revision( $revision_id );
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
			$data['title'] = $post->post_title;
		}

		if ( ! empty( $schema['properties']['content'] ) ) {
			if ( ! empty( $post->post_password ) ) {
				$this->prepare_password_response( $post->post_password );
			}

			$data['content'] = $post->post_content;
		}

		if ( ! empty( $schema['properties']['excerpt'] ) ) {
			$data['excerpt'] = $this->prepare_excerpt_response( $post->post_excerpt );
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
			'author_name' => get_the_author_meta( 'display_name', $post->post_author ),
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
			return mysql_to_rfc3339( $date );
		}

		return mysql_to_rfc3339( $date_gmt );
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

		$excerpt = apply_filters( 'get_the_excerpt', $excerpt );

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
					);
					break;

				case 'content':
					$schema['properties']['content'] = array(
						'description' => 'Content for the object, as it exists in the database.',
						'type'        => 'string',
						'context'     => array( 'view' ),
					);
					break;

				case 'excerpt':
					$schema['properties']['excerpt'] = array(
						'description' => 'Excerpt for the object, as it exists in the database.',
						'type'        => 'string',
						'context'     => array( 'view' ),
					);
					break;

			}
		}

		return $this->add_additional_fields_schema( $schema );
	}

}