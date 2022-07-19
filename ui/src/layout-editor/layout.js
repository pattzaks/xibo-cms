// LAYOUT Module
const Region = require('../layout-editor/region.js');
const Canvas = require('../layout-editor/canvas.js');
const Widget = require('../editor-core/widget.js');

/**
 * Layout contructor
 * @param  {number} id - layout id
 * @param  {object} data - data from the API request
 */
const Layout = function(id, data) {
  // Is it editable? ( checkif status is draft )
  this.editable = (data.publishedStatusId == 2);

  // Does user have permission to schedule now page?
  this.scheduleNowPermission = data.scheduleNowPermission;

  // Does user have permission to delete layout
  this.deletePermission = data.deletePermission;

  // Parent Id
  this.parentLayoutId = data.parentId;

  // Layout name
  this.name = data.layout;

  // Layout properties
  this.id = 'layout_' + id;
  this.layoutId = id;

  this.folderId = data.folderId;

  // Campaing ID
  this.campaignId = data.campaignId;

  this.regions = {};
  this.duration = null;

  this.drawer = {};

  this.width = data.width;
  this.height = data.height;

  this.backgroundImage = data.backgroundImageId;
  this.backgroundColor = data.backgroundColor;

  this.code = data.code;
  this.folderId = data.folderId;

  // Interactive actions
  this.actions = data.actions;

  // Get background image if exists, if not, get the background color
  this.backgroundCss = function(width = this.width, height = this.height) {
    if (this.backgroundImage === null) {
      return this.backgroundColor;
    } else {
      // Get API link
      let linkToAPI = urlsForApi['layout']['downloadBackground'].url;
      // Replace ID in the link
      linkToAPI = linkToAPI.replace(':id', this.layoutId);

      return 'url(\'' + linkToAPI +
        '?preview=1&width=' + width + '&height=' + height +
        '&proportional=0&layoutBackgroundId=' + this.backgroundImage +
        '\') top center no-repeat; background-color: ' + this.backgroundColor;
    }
  };

  // Create data structure based on the BE response ( data )
  this.createDataStructure(data);

  // Calculate duration, looping, and all properties related to time
  this.calculateTimeValues();
};

/**
 * Create data structure
 * @param  {object} data - data from the API request
 */
Layout.prototype.createDataStructure = function(data) {
  // layout duration calculated based on the longest region duration
  let layoutDuration = 0;

  this.numRegions = data.regions.length;

  // Create regions and add them to the layout
  for (const region in data.regions) {
    if (Object.prototype.hasOwnProperty.call(data.regions, region)) {
      let regionDuration = 0;
      const isPlaylist = (data.regions[region].type === 'playlist');

      const newRegion = isPlaylist ?
        new Region(
          data.regions[region].regionId,
          data.regions[region],
        ) :
        new Canvas(
          data.regions[region].regionId,
          data.regions[region],
        );

      // Save index
      newRegion.index = parseInt(region) + 1;

      // Widgets
      const widgets = newRegion.playlists.widgets;

      newRegion.numWidgets = widgets.length;

      // Create widgets for this region
      for (const widget in widgets) {
        if (Object.prototype.hasOwnProperty.call(widgets, widget)) {
          const newWidget = new Widget(
            widgets[widget].widgetId,
            widgets[widget],
            data.regions[region].regionId,
            this,
          );

          // Save index
          newWidget.index = parseInt(widget) + 1;

          // Mark the widget as sortable if region can be sorted/edited
          newWidget.isSortable = newRegion.isEditable;

          newWidget.designerObject = lD;

          // calculate expire status
          newWidget.calculateExpireStatus();

          // Check if widget is enabled
          newWidget.checkIfEnabled();

          // Add newWidget to the Region widget object
          newRegion.widgets[newWidget.id] = newWidget;

          // Mark the region as not empty
          newRegion.isEmpty = false;

          // increase region Duration with widget base duration
          regionDuration += newWidget.getTotalDuration();
        }
      }

      // Set region duration
      newRegion.duration = regionDuration;

      // Push Region to the Layout region array
      this.regions[newRegion.id] = newRegion;

      // If not playlist, save region also as canvas to the layout
      if (!isPlaylist) {
        this.canvas = this.regions[newRegion.id];
      }

      // update layoutDuration if the current regions is the longest one
      if (regionDuration > layoutDuration) {
        layoutDuration = regionDuration;
      }
    }
  }

  // Create drawer object if exists
  for (const drawer in data.drawers) {
    if (Object.prototype.hasOwnProperty.call(data.drawers, drawer)) {
      this.createDrawer(data.drawers[drawer]);
    }
  }

  // Set layout duration
  this.duration = layoutDuration;
};

/**
 * Calculate timeline values ( duration, loops )
 * based on widget and region duration
 */
Layout.prototype.calculateTimeValues = function() {
  for (const region in this.regions) {
    if (Object.prototype.hasOwnProperty.call(this.regions, region)) {
      const currRegion = this.regions[region];

      // Widgets
      const widgets = currRegion.widgets;
      let loopSingleWidget = false;
      let singleWidget = false;

      // If there is only one widget in the playlist
      // check the loop option for that region
      if (Object.keys(widgets).length === 1) {
        singleWidget = true;
        // Check the loop option
        for (const option in currRegion.options) {
          if (
            currRegion.options[option].option === 'loop' &&
            currRegion.options[option].value === '1'
          ) {
            currRegion.loop = true;
            loopSingleWidget = true;
            break;
          }
        }
      } else if (parseFloat(currRegion.duration) < parseFloat(this.duration)) {
      // if the region duration is less than the layout duration enable loop
        currRegion.loop = true;
      }

      for (const widget in widgets) {
        if (Object.prototype.hasOwnProperty.call(widgets, widget)) {
          const currWidget = widgets[widget];

          // If the widget needs to be extended
          currWidget.singleWidget = singleWidget;
          currWidget.loop = loopSingleWidget;
        }
      }
    }
  }
};

/**
 * Checkout layout
 */
Layout.prototype.checkout = function() {
  const linkToAPI = urlsForApi.layout.checkout;
  let requestPath = linkToAPI.url;

  lD.common.showLoadingScreen();

  // replace id if necessary/exists
  requestPath = requestPath.replace(':id', this.layoutId);

  // Deselect previous selected object
  lD.selectObject();

  $.ajax({
    url: requestPath,
    type: linkToAPI.type,
  }).done(function(res) {
    if (res.success) {
      bootbox.hideAll();

      toastr.success(res.message);

      // Turn off read only mode
      lD.readOnlyMode = false;

      // Hide read only message
      lD.editorContainer.removeClass('view-mode');
      lD.editorContainer.find('#read-only-message').remove();

      // Reload layout
      lD.reloadData(res.data, false, true);

      // Refresh toolbar
      lD.toolbar.render();

      lD.common.hideLoadingScreen();
    } else {
      // Login Form needed?
      if (res.login) {
        window.location.href = window.location.href;
        location.reload();
      } else {
        toastr.error(res.message);
      }

      lD.common.hideLoadingScreen();
    }
  }).fail(function(jqXHR, textStatus, errorThrown) {
    lD.common.hideLoadingScreen();

    // Output error to console
    console.error(jqXHR, textStatus, errorThrown);
  });
};

/**
 * Publish layout
 */
Layout.prototype.publish = function() {
  const linkToAPI = urlsForApi.layout.publish;
  let requestPath = linkToAPI.url;

  lD.common.showLoadingScreen();

  // replace id if necessary/exists
  requestPath = requestPath.replace(':id', this.parentLayoutId);

  const serializedData = $('#layoutPublishForm').serialize();

  $.ajax({
    url: requestPath,
    type: linkToAPI.type,
    data: serializedData,
  }).done(function(res) {
    if (res.success) {
      bootbox.hideAll();

      toastr.success(res.message);

      // Redirect to the new published layout ( read only mode )
      window.location.href =
        urlsForApi.layout.designer.url.replace(
          ':id', res.data.layoutId) + '?vM=1';
    } else {
      lD.common.hideLoadingScreen();

      // Login Form needed?
      if (res.login) {
        window.location.href = window.location.href;
        location.reload();
      } else {
        toastr.error(res.message);

        // Close dialog
        bootbox.hideAll();
      }
    }
  }).fail(function(jqXHR, textStatus, errorThrown) {
    lD.common.hideLoadingScreen();

    // Output error to console
    console.error(jqXHR, textStatus, errorThrown);
  });
};

/**
 * Discard layout
 */
Layout.prototype.discard = function() {
  const linkToAPI = urlsForApi.layout.discard;
  let requestPath = linkToAPI.url;

  lD.common.showLoadingScreen();

  // Deselect previous selected object
  lD.selectObject();

  // replace id if necessary/exists
  requestPath = requestPath.replace(':id', this.parentLayoutId);

  const serializedData = $('#layoutDiscardForm').serialize();

  $.ajax({
    url: requestPath,
    type: linkToAPI.type,
    data: serializedData,
  }).done(function(res) {
    if (res.success) {
      bootbox.hideAll();

      toastr.success(res.message);

      // Redirect to the layout grid
      window.location.href = urlsForApi.layout.list.url;
    } else {
      // Login Form needed?
      if (res.login) {
        window.location.href = window.location.href;
        location.reload();
      } else {
        toastr.error(res.message);

        // Close dialog
        bootbox.hideAll();
      }
    }

    lD.common.hideLoadingScreen();
  }).fail(function(jqXHR, textStatus, errorThrown) {
    lD.common.hideLoadingScreen();

    // Output error to console
    console.error(jqXHR, textStatus, errorThrown);
  });
};

/**
 * Delete layout
 */
Layout.prototype.delete = function() {
  const linkToAPI = urlsForApi.layout.delete;
  let requestPath = linkToAPI.url;

  lD.common.showLoadingScreen();

  // Deselect previous selected object
  lD.selectObject();

  // replace id if necessary/exists
  requestPath = requestPath.replace(':id', this.layoutId);

  const serializedData = $('#layoutDeleteForm').serialize();

  $.ajax({
    url: requestPath,
    type: linkToAPI.type,
    data: serializedData,
  }).done(function(res) {
    if (res.success) {
      bootbox.hideAll();

      toastr.success(res.message);

      // Redirect to the layout grid
      window.location.href = urlsForApi.layout.list.url;
    } else {
      // Login Form needed?
      if (res.login) {
        window.location.href = window.location.href;
        location.reload();
      } else {
        toastr.error(res.message);

        // Close dialog
        bootbox.hideAll();
      }
    }

    lD.common.hideLoadingScreen();
  }).fail(function(jqXHR, textStatus, errorThrown) {
    lD.common.hideLoadingScreen();

    // Output error to console
    console.error(jqXHR, textStatus, errorThrown);
  });
};

/**
 * Add a new empty element to the layout
 * @param {string} elementType - element type (widget, region, ...)
 * @param {object} options - Position to add the element to
 * @param {object} [options.positionToAdd] - Position to add the element to
 * @param {object} [options.elementSubtype] - Element subtype
 * @return {object} - Manager change
 */
Layout.prototype.addElement = function(
  elementType,
  {
    positionToAdd = null,
    elementSubtype = null,
  } = {},
) {
  let newValues = null;

  // / Get position values if they exist
  if (positionToAdd !== null) {
    newValues = positionToAdd;
  }

  // If element is type region, add type flag
  if (elementType === 'region') {
    newValues = Object.assign(newValues, {
      type: elementSubtype,
    });
  }

  // Add a create change to the history array, and
  // an option to update the Id on the change to the newly created object
  return lD.manager.addChange(
    'create',
    elementType, // targetType
    null, // targetId
    null, // oldValues
    newValues, // newValues
    {
      updateTargetId: true, // options.updateTargetId
    },
  );
};

/**
 * Delete an element in the layout, by ID
 * @param {string} elementType - element type (widget, region, ...)
 * @param {number} elementId - element id
 * @param {object =} [options] - Delete submit params/options
 * @return {object} - Manager change
 */
Layout.prototype.deleteElement =
  function(elementType, elementId, options = null) {
    lD.common.showLoadingScreen('deleteElement');

    // Save all changes first
    return lD.manager.saveAllChanges().then((res) => {
    // Remove changes from the history array
      return lD.manager.removeAllChanges(elementType, elementId).then((res) => {
      // Unselect selected object before deleting
        lD.selectObject();

        lD.common.hideLoadingScreen('deleteElement');

        // Create a delete type change, upload it
        // but don't add it to the history array
        return lD.manager.addChange(
          'delete',
          elementType, // targetType
          elementId, // targetId
          null, // oldValues
          options, // newValues
          {
            addToHistory: false, // options.addToHistory
          },
        );
      }).catch(function() {
        lD.common.hideLoadingScreen('deleteElement');

        toastr.error(errorMessagesTrans.removeAllChangesFailed);
      });
    }).catch(function() {
      lD.common.hideLoadingScreen('deleteElement');

      toastr.error(errorMessagesTrans.saveAllChangesFailed);
    });
  };

/**
 * Save playlist order
 * @param {object} playlist - playlist
 * @param {object} widgets - Widgets DOM objects array
 * @return {object} - Manager change
 */
Layout.prototype.savePlaylistOrder = function(playlist, widgets) {
  // Get playlist's widgets previous order
  const oldOrder = {};
  let orderIndex = 1;
  for (const element in playlist.widgets) {
    if (playlist.widgets.hasOwnProperty(element)) {
      oldOrder[playlist.widgets[element].widgetId] = orderIndex;
      orderIndex++;
    }
  }

  // Get new order
  const newOrder = {};

  for (let index = 0; index < widgets.length; index++) {
    const widget =
      lD.getElementByTypeAndId(
        'widget',
        $(widgets[index]).attr('id'), 'region_' + playlist.regionId,
      );

    newOrder[widget.widgetId] = index + 1;
  }

  if (JSON.stringify(newOrder) === JSON.stringify(oldOrder)) {
    return Promise.resolve({
      message: errorMessagesTrans.listOrderNotChanged,
    });
  }

  return lD.manager.addChange(
    'order',
    'playlist',
    playlist.playlistId,
    {
      widgets: oldOrder,
    },
    {
      widgets: newOrder,
    },
  ).catch((error) => {
    toastr.error(errorMessagesTrans.playlistOrderSave);
    console.log(error);
  });
};

/**
 * Update layout status fields
 * @param {int} status - Status code
 * @param {string} statusFeedback - Status feedback message
 * @param {string[]} statusMessages - Status messages array
 * @param {int} updatedLayoutDuration - Update Layout duration
 */
Layout.prototype.updateStatus = function(
  status, statusFeedback, statusMessages, updatedLayoutDuration,
) {
  // Update status property
  this.status = {
    code: status,
    description: statusFeedback,
    messages: statusMessages,
  };

  // Update layout duration
  if (updatedLayoutDuration) {
    this.duration = Math.round(Number(updatedLayoutDuration) * 100) / 100;
  }

  // Update layout status
  lD.topbar.updateLayoutStatus();
};


/**
 * Calculate layout values for the layout based on the scale of this container
 * @param {object} container - Container DOM object
 * @return {object} Clone Object containing dimensions for the object
 */
Layout.prototype.scale = function(container) {
  const layoutClone = Object.assign({}, this);

  // Get container dimensions
  const containerDimensions = {
    width: container.width(),
    height: container.height(),
  };

  // Calculate ratio
  const elementRatio = layoutClone.width / layoutClone.height;
  const containerRatio = containerDimensions.width / containerDimensions.height;

  // Create container properties object
  layoutClone.scaledDimensions = {};

  // Calculate scale factor
  if (elementRatio > containerRatio) {
    // element is more "landscapish" than the container
    // Scale is calculated using width
    layoutClone.scaledDimensions.scale =
      containerDimensions.width / layoutClone.width;
  } else { // Same ratio or the container is the most "landscapish"
    // Scale is calculated using height
    layoutClone.scaledDimensions.scale =
      containerDimensions.height / layoutClone.height;
  }

  // Calculate new values for the element using the scale factor
  layoutClone.scaledDimensions.width =
    layoutClone.width * layoutClone.scaledDimensions.scale;
  layoutClone.scaledDimensions.height =
    layoutClone.height * layoutClone.scaledDimensions.scale;

  // Calculate top and left values to centre the element in the container
  layoutClone.scaledDimensions.top =
    containerDimensions.height / 2 - layoutClone.scaledDimensions.height / 2;
  layoutClone.scaledDimensions.left =
    containerDimensions.width / 2 - layoutClone.scaledDimensions.width / 2;

  // Get scaled background
  layoutClone.calculatedBackground =
    layoutClone.backgroundCss(
      layoutClone.scaledDimensions.width,
      layoutClone.scaledDimensions.height,
    );

  // Regions Scalling
  for (const region in layoutClone.regions) {
    if (layoutClone.regions.hasOwnProperty(region)) {
      layoutClone.regions[region].scaledDimensions = {};

      // Loop through the container properties
      // and scale them according to the layout scale from the original
      for (const property in layoutClone.regions[region].dimensions) {
        if (layoutClone.regions[region].dimensions.hasOwnProperty(property)) {
          layoutClone.regions[region].scaledDimensions[property] =
            layoutClone.regions[region].dimensions[property] *
            layoutClone.scaledDimensions.scale;
        }
      }
    }
  }

  return layoutClone;
};

/**
 * Create drawer region for actions targets
 * @param {object} drawerData - Drawer data
 */
Layout.prototype.createDrawer = function(drawerData) {
  // Create drawer as a region
  const newDrawer = new Region(
    drawerData.regionId,
    drawerData,
  );

  // Save index
  newDrawer.index = 1;

  // Widgets
  const widgets = newDrawer.playlists.widgets;

  newDrawer.numWidgets = widgets.length;

  // Create widgets for this region
  for (const widget in widgets) {
    if (widgets.hasOwnProperty(widget)) {
      const newWidget = new Widget(
        widgets[widget].widgetId,
        widgets[widget],
        drawerData.regionId,
        this,
      );

      // Save index
      newWidget.index = parseInt(widget) + 1;

      newWidget.designerObject = lD;

      newWidget.drawerWidget = true;

      // calculate expire status
      newWidget.calculateExpireStatus();

      // Check if widget is enabled
      newWidget.checkIfEnabled();

      // update duration
      newWidget.getDuration();

      // We need to validate if the target region still exists in the layout
      if (this.regions['region_' + newWidget.getOptions().targetRegionId]) {
        newWidget.targetRegionId = newWidget.getOptions().targetRegionId;
      }

      // Add newWidget to the Region widget object
      newDrawer.widgets[newWidget.id] = newWidget;

      // Mark the region as not empty
      newDrawer.isEmpty = false;
    }
  }

  // Dimensions
  newDrawer.dimensions = {
    width: drawerData.width,
    height: drawerData.height,
    top: drawerData.top,
    left: drawerData.left,
  };

  // Push Region to the Layout region array
  this.drawer = newDrawer;
};

/**
 * Move a widget in a region
 * @param {string} regionId - The target region
 * @param {string} widgetId - The widget to be moved
 * @param {string} moveType - "topLeft"; "left"; "right"; "topRight";
 */
Layout.prototype.moveWidgetInRegion = function(regionId, widgetId, moveType) {
  const getElement = this.DOMObject.find('#' + regionId + ' #' + widgetId);

  switch (moveType) {
  case 'oneRight':
    getElement.insertAfter(
      getElement.next('.designer-widget:not(.designer-widget-ghost)'),
    );
    break;

  case 'oneLeft':
    getElement.insertBefore(
      getElement.prev('.designer-widget:not(.designer-widget-ghost)'),
    );
    break;

  case 'topRight':
    getElement.insertAfter(
      getElement.nextAll('.designer-widget:not(.designer-widget-ghost)').last(),
    );
    break;

  case 'topLeft':
    getElement.prependTo(getElement.parent());
    break;

  default:
    console.warn('Change type not known');
    return;
  }

  // Save new order
  lD.common.showLoadingScreen();

  // Get playlist
  const region = this.DOMObject.find('#' + regionId);
  const playlist =
    lD.getElementByTypeAndId(
      $(region).data('type'),
      $(region).attr('id'),
    ).playlists;

  // Add sort class
  $(region).addClass('to-sort');

  lD.layout.savePlaylistOrder(playlist, $(region)
    .find('.designer-widget:not(.designer-widget-ghost)'))
    .then((res) => { // Success
      lD.common.hideLoadingScreen();

      // Behavior if successful
      toastr.success(res.message);
      lD.reloadData(lD.layout);
    }).catch((error) => { // Fail/error
      // Remove sort class
      $(region).removeClass('to-sort');

      lD.common.hideLoadingScreen();

      // Show error returned or custom message to the user
      // Show error returned or custom message to the user
      let errorMessage = '';

      if (typeof error == 'string') {
        errorMessage = error;
      } else {
        errorMessage = error.errorThrown;
      }

      toastr.error(
        errorMessagesTrans.saveOrderFailed.replace('%error%', errorMessage),
      );
    });
};

module.exports = Layout;
