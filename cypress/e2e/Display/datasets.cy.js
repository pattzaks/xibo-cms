/*
 * Copyright (C) 2023 Xibo Signage Ltd
 *
 * Xibo - Digital Signage - https://xibosignage.com
 *
 * This file is part of Xibo.
 *
 * Xibo is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Xibo is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Xibo.  If not, see <http://www.gnu.org/licenses/>.
 */

/* eslint-disable max-len */
describe('Datasets', function() {
  let testRun = '';

  beforeEach(function() {
    cy.login();

    testRun = Cypress._.random(0, 1e9);
  });

  it('should add one empty dataset', function() {
    cy.visit('/dataset/view');

    // Click on the Add Dataset button
    cy.contains('Add DataSet').click();

    cy.get('.modal input#dataSet')
      .type('Cypress Test Dataset ' + testRun + '_1');

    // Add first by clicking next
    cy.get('.modal .save-button').click();

    // Check if dataset is added in toast message
    cy.contains('Added Cypress Test Dataset ' + testRun + '_1');
  });

  it('searches and edit existing dataset', function() {
    // Create a new dataset and then search for it and delete it
    cy.createDataset('Cypress Test Dataset ' + testRun).then((id) => {
      cy.intercept({
        url: '/dataset?*',
        query: {dataSet: 'Cypress Test Dataset ' + testRun},
      }).as('loadGridAfterSearch');

      // Intercept the PUT request
      cy.intercept({
        method: 'PUT',
        url: '/dataset/*',
      }).as('putRequest');

      cy.visit('/dataset/view');

      // Filter for the created dataset
      cy.get('#Filter input[name="dataSet"]')
        .type('Cypress Test Dataset ' + testRun);

      // Wait for the grid reload
      cy.wait('@loadGridAfterSearch');

      // Click on the first row element to open the delete modal
      cy.get('#datasets tr:first-child .dropdown-toggle').click();
      cy.get('#datasets tr:first-child .dataset_button_edit').click();

      cy.get('.modal input#dataSet').clear()
        .type('Cypress Test Dataset Edited ' + testRun);

      // edit test dataset
      cy.get('.bootbox .save-button').click();

      // Wait for the intercepted PUT request and check the form data
      cy.wait('@putRequest').then((interception) => {
        // Get the request body (form data)
        const response = interception.response;
        const responseData = response.body.data;

        // assertion on the "dataset" value
        expect(responseData.dataSet).to.eq('Cypress Test Dataset Edited ' + testRun);
      });

      // Delete the dataset and assert success
      cy.deleteDataset(id).then((res) => {
        expect(res.status).to.equal(204);
      });
    });
  });

  it.only('copy an existing dataset', function() {
    // Create a new dataset and then search for it and delete it
    cy.createDataset('Cypress Test Dataset ' + testRun).then((res) => {
      cy.intercept({
        url: '/dataset?*',
        query: {dataSet: 'Cypress Test Dataset ' + testRun},
      }).as('loadGridAfterSearch');

      // Intercept the POST request
      cy.intercept({
        method: 'POST',
        url: /\/dataset\/copy\/\d+/,
      }).as('postRequest');

      cy.visit('/dataset/view');

      // Filter for the created dataset
      cy.get('#Filter input[name="dataSet"]')
        .type('Cypress Test Dataset ' + testRun);

      // Wait for the grid reload
      cy.wait('@loadGridAfterSearch');

      // Click on the first row element to open the delete modal
      cy.get('#datasets tr:first-child .dropdown-toggle').click();
      cy.get('#datasets tr:first-child .dataset_button_copy').click();

      // Delete test dataset
      cy.get('.bootbox .save-button').click();

      // Wait for the intercepted POST request and check the form data
      cy.wait('@postRequest').then((interception) => {
        // Get the request body (form data)
        const response = interception.response;
        const responseData = response.body.data;
        expect(responseData.dataSet).to.include('Cypress Test Dataset ' + testRun + ' 2');
      });
    });
  });

  it('searches and delete existing dataset', function() {
    // Create a new dataset and then search for it and delete it
    cy.createDataset('Cypress Test Dataset ' + testRun).then((res) => {
      cy.server();
      cy.route('/dataset?draw=2&*').as('datasetGridLoad');

      cy.visit('/dataset/view');

      // Filter for the created dataset
      cy.get('#Filter input[name="dataSet"]')
        .type('Cypress Test Dataset ' + testRun);

      // Wait for the grid reload
      cy.wait('@datasetGridLoad');

      // Click on the first row element to open the delete modal
      cy.get('#datasets tr:first-child .dropdown-toggle').click();
      cy.get('#datasets tr:first-child .dataset_button_delete').click();

      // Delete test dataset
      cy.get('.bootbox .save-button').click();

      // Check if dataset is deleted in toast message
      cy.get('.toast').contains('Deleted Cypress Test Dataset');
    });
  });

  it('selects multiple datasets and delete them', function() {
    // Create a new dataset and then search for it and delete it
    cy.createDataset('Cypress Test Dataset ' + testRun).then((res) => {
      cy.server();
      cy.route('/dataset?draw=2&*').as('datasetGridLoad');

      // Delete all test datasets
      cy.visit('/dataset/view');

      // Clear filter
      cy.get('#Filter input[name="dataSet"]')
        .clear()
        .type('Cypress Test Dataset');

      // Wait for the grid reload
      cy.wait('@datasetGridLoad');

      // Select all
      cy.get('button[data-toggle="selectAll"]').click();

      // Delete all
      cy.get('.dataTables_info button[data-toggle="dropdown"]').click();
      cy.get('.dataTables_info a[data-button-id="dataset_button_delete"]').click();

      cy.get('input#deleteData').check();
      cy.get('button.save-button').click();

      // Modal should contain one successful delete at least
      cy.get('.modal-body').contains(': Success');
    });
  });
});