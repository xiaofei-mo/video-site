/*
 * Copyright (C) 2017 Mark P. Lindsay
 * 
 * This file is part of mysteriousobjectsatnoon.
 *
 * mysteriousobjectsatnoon is free software: you can redistribute it and/or 
 * modify it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * mysteriousobjectsatnoon is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with mysteriousobjectsatnoon.  If not, see 
 * <http://www.gnu.org/licenses/>.
 */

import { A } from '../constants'
import firebase from '../utils/firebase'
import Immutable from 'immutable'
import { push } from 'react-router-redux'
import { convertFromRaw } from 'draft-js'

import getCloudFrontUrl from '../utils/getCloudFrontUrl';
import getTimingOrUsernameFromPath from '../utils/getTimingOrUsernameFromPath';
import pageActions from './page'

export default {

  itemClicked: (item, left, top, currentTime) => {
    return (dispatch, getState) => {
      const state = getState()
      if (state.getIn(['link', 'source', 'item']) !== null) {
        // If we have a source item, it means that this is a click on the 
        // destination item. So, let's form a link from the source item to the
        // destination item in Firebase.
        const sourceId = state.getIn(['link', 'source', 'item', 'id'])
        const destinationId = item.get('id')
        const itemsRef = firebase.database().ref().child('items')
        const sourceRef = itemsRef.child(sourceId)
        const destRef = itemsRef.child(destinationId)

        sourceRef.child('linkedTo').once('value', snapshot => {
          const linkedTo = Immutable.fromJS(snapshot.val())
          if (linkedTo === null || !linkedTo.includes(destinationId)) {
            // Add new link to source item
            // Just use destinationId as the key instead of using auto-generated id
            sourceRef.child(`linkedTo/${destinationId}`).set(destinationId)
            destRef.child(`linkedFrom/${sourceId}`).set(sourceId)
          } else {
            // Remove existed link from source item
            sourceRef.child(`linkedTo/${destinationId}`).remove()
            destRef.child(`linkedFrom/${sourceId}`).remove()
          }
        })
        // Start the timer for stage 2 of the linking transition. Stage 2 starts
        // 4 seconds in.
        setTimeout(() => {
          // If the current pathname is not the same as the pathname at the time 
          // the source was clicked, navigate back to the original page. 
          if (state.getIn(['link', 'pathname']) !==
            state.getIn(['link', 'pathnameAtSourceClickTime'])) {
            dispatch(push(state.getIn(['link', 'pathnameAtSourceClickTime'])))
          }
          dispatch({
            type: A.LINKING_TRANSITION_STAGE_1_FINISHED
          })
        }, 4000)
        // Also, start the timer for completely ending the linking transition 
        // after 7 seconds.
        setTimeout(() => {
          // Update links
          const path = getTimingOrUsernameFromPath(
            state.getIn(['link', 'pathnameAtSourceClickTime'])
          )
          dispatch(pageActions.listenToItems(path))

          dispatch({
            type: A.LINKING_TRANSITION_FINISHED
          })
        }, 7000)
      }

      dispatch({
        type: A.ITEM_CLICKED,
        payload: Immutable.Map({
          currentTime: currentTime,
          item: item,
          left: left,
          top: top
        })
      })
    }
  },

  planeClicked: () => {
    return {
      type: A.PLANE_CLICKED
    }
  },

  requestStills: (item) => (dispatch) => {
    dispatch({
      type: A.REQUEST_STILLS,
    });

    const itemsRef = firebase.database().ref().child('items');
    const links = item.get('linkedTo');

    Promise.all(
      links.map(itemId => itemsRef.child(itemId).once('value')).values()
    ).then((linkedItemSnapshots) => {
      const stills = new Immutable.Map(linkedItemSnapshots.map((snapshot) => {
        const destItem = snapshot.val();
        // Choose the still for different item types
        switch (destItem.type) {
          case 'video':
            return [
              destItem.id,
              getCloudFrontUrl(destItem.results.posterImage.ssl_url),
            ];

          case 'audio':
            return [
              destItem.id,
              getCloudFrontUrl(destItem.results.waveform.ssl_url),
            ];

          case 'image':
            return [
              destItem.id,
              getCloudFrontUrl(destItem.results.encode.ssl_url),
            ];

          case 'text':
            // TODO: plainText => svg dataUrl
            // const textContent = convertFromRaw(item.rawState).getPlainText();
            const testSVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M224%20387.814V512L32 320l192-192v126.912C447.375 260.152 437.794 103.016 380.93 0 521.287 151.707 491.48 394.785 224 387.814z'/%3E%3C/svg%3E`;
            return [destItem.id, testSVG];
          default: return null;
        }
      }));

      dispatch({
        type: A.STILLS_PREPARED,
        payload: stills,
      });
    });
  }
}
